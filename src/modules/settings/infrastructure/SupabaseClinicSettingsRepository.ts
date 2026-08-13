import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { parseStoredClinicAddress } from '@/lib/clinic/address'
import {
  businessHoursToJson,
  DEFAULT_BUSINESS_HOURS,
  parseStoredBusinessHours,
} from '@/lib/clinic/business-hours'
import type { Database, Json } from '@/lib/supabase/database.types'
import {
  parseNotificationPreferences,
  type NotificationPreferences,
} from '@/lib/notifications/preferences'

import type {
  AppointmentDefaults,
  BusinessHours,
  ClinicProfile,
  ClinicProfileInput,
  ClinicSettings,
} from '../domain/ClinicSettings'
import type { ClinicSettingsRepository } from '../domain/ClinicSettingsRepository'
import { ClinicSettingsError } from '../domain/ClinicSettingsError'
import { DEFAULT_APPOINTMENT_DEFAULTS } from '../domain/settingsDefaults'
import { storedAppointmentDefaultsSchema } from '../schemas/settings.schema'

type Client = SupabaseClient<Database>

const CLINIC_SELECT =
  'id, slug, trade_name, legal_name, cnpj, timezone, locale, phone, email, address'
const SETTINGS_SELECT =
  'business_hours, appointment_defaults, notification_prefs, ai_enabled'

/**
 * Adapter Supabase das configurações — feature **C-01**.
 *
 * Toda escrita filtra a clínica explicitamente. A RLS impede o vazamento; o
 * filtro impede a operação errada — e transforma "linha de outra clínica" em
 * "não encontrado" em vez de "atualizou zero linhas em silêncio".
 */
export class SupabaseClinicSettingsRepository
  implements ClinicSettingsRepository
{
  constructor(private readonly client: Client) {}

  async load(clinicId: string): Promise<ClinicSettings> {
    /*
     * Duas consultas em paralelo, e não um join: `clinic_settings` pode não ter
     * linha (ver `upsertSettings`), e um join embutido faria a ausência da
     * preferência parecer ausência da clínica.
     */
    const [clinicResult, settingsResult] = await Promise.all([
      this.client
        .from('clinics')
        .select(CLINIC_SELECT)
        .eq('id', clinicId)
        .is('deleted_at', null)
        .maybeSingle(),
      this.client
        .from('clinic_settings')
        .select(SETTINGS_SELECT)
        .eq('clinic_id', clinicId)
        .maybeSingle(),
    ])

    if (clinicResult.error) throw toWriteError(clinicResult.error)
    if (!clinicResult.data) throw notFound(clinicId)

    if (settingsResult.error) {
      /*
       * Preferência é enriquecimento: sem ela a identidade da clínica continua
       * correta e editável. Falhar a tela inteira porque o horário não carregou
       * seria trocar um problema pequeno por um grande.
       */
      console.error('[settings] load clinic_settings', {
        code: settingsResult.error.code ?? null,
      })
    }

    const hours = readBusinessHours(settingsResult.data?.business_hours)

    return {
      profile: toProfile(clinicResult.data),
      businessHours: hours.value,
      businessHoursSource: hours.source,
      appointmentDefaults: parseAppointmentDefaults(
        settingsResult.data?.appointment_defaults,
      ),
      notificationPreferences: parseNotificationPreferences(
        settingsResult.data?.notification_prefs,
      ),
      // Ausência de linha conta como DESLIGADO: uma clínica que nunca abriu as
      // configurações não pediu para uma máquina falar com seus pacientes.
      aiEnabled: settingsResult.data?.ai_enabled === true,
    }
  }

  async updateProfile(
    clinicId: string,
    input: ClinicProfileInput,
  ): Promise<ClinicProfile> {
    const { data, error } = await this.client
      .from('clinics')
      .update({
        trade_name: input.tradeName,
        legal_name: input.legalName,
        cnpj: input.cnpj,
        phone: input.phone,
        email: input.email,
        /*
         * O endereço é gravado SEMPRE, mesmo vazio: um objeto com todos os
         * campos nulos é a forma de apagar o que estava lá. Omitir a chave
         * manteria o endereço antigo depois de a pessoa limpar o formulário.
         */
        address: input.address,
        updated_at: new Date().toISOString(),
      })
      .eq('id', clinicId)
      // Clínica arquivada não volta a ser editada por um formulário.
      .is('deleted_at', null)
      .select(CLINIC_SELECT)
      .maybeSingle()

    if (error) throw toWriteError(error)
    if (!data) throw notFound(clinicId)

    return toProfile(data)
  }

  async updateBusinessHours(
    clinicId: string,
    hours: BusinessHours,
  ): Promise<BusinessHours> {
    const row = await this.upsertSettings(clinicId, {
      business_hours: businessHoursToJson(hours),
    })

    /*
     * Devolve o que o BANCO gravou, relido pelo mesmo schema — e não o que
     * entrou. Se a coluna transformar o valor de alguma forma, a tela mostra a
     * transformação em vez de exibir o que a pessoa digitou e divergir na
     * próxima visita.
     */
    return readBusinessHours(row.business_hours).value
  }

  async updateAppointmentDefaults(
    clinicId: string,
    defaults: AppointmentDefaults,
  ): Promise<AppointmentDefaults> {
    const row = await this.upsertSettings(clinicId, {
      appointment_defaults: {
        durationMinutes: defaults.durationMinutes,
      },
    })

    return parseAppointmentDefaults(row.appointment_defaults)
  }

  async updateNotificationPreferences(
    clinicId: string,
    preferences: NotificationPreferences,
  ): Promise<NotificationPreferences> {
    const row = await this.upsertSettings(clinicId, {
      notification_prefs: { operational: preferences.operational },
    })

    return parseNotificationPreferences(row.notification_prefs)
  }

  /**
   * Liga ou desliga a IA que responde paciente.
   *
   * Devolve o valor que ficou GRAVADO, não o que foi pedido: é a diferença entre
   * a tela dizer "desliguei" e a tela dizer "está desligado". Numa configuração
   * que decide se uma máquina fala com paciente, essa distinção é a única que
   * importa quando a escrita falha.
   */
  async setAiEnabled(clinicId: string, enabled: boolean): Promise<boolean> {
    const row = await this.upsertSettings(clinicId, { ai_enabled: enabled })

    return row.ai_enabled === true
  }

  /**
   * Grava uma preferência de configuração, criando a linha se ela não existir.
   *
   * `clinic_settings.clinic_id` é chave primária, então a linha deveria ter
   * nascido junto com a clínica, em `create_clinic()`. **Deveria** é o mais
   * longe que se pode ir daqui: o corpo da RPC não é legível a partir do
   * repositório (bloqueio B1), então o adapter não presume.
   *
   * UPDATE primeiro, INSERT como recuperação — nesta ordem de propósito. No
   * caminho comum (a linha existe) nunca se depende de haver policy de INSERT em
   * `clinic_settings`, que é a policy com menos motivo para existir.
   *
   * ## O que este método NÃO consegue distinguir
   *
   * Um UPDATE recusado pela RLS e um UPDATE sem linha para atualizar chegam
   * iguais do PostgREST: zero linhas, sem erro. Por isso o INSERT vem logo
   * atrás — se o problema era permissão, ele falha com 42501 e a tradução vira
   * 'forbidden', que é a resposta correta para os dois casos.
   */
  private async upsertSettings(
    clinicId: string,
    patch: {
      business_hours?: Json
      appointment_defaults?: Json
      notification_prefs?: Json
      ai_enabled?: boolean
    },
  ): Promise<{
    business_hours: Json
    appointment_defaults: Json
    notification_prefs: Json
    ai_enabled: boolean
  }> {
    const now = new Date().toISOString()

    const { data, error } = await this.client
      .from('clinic_settings')
      .update({ ...patch, updated_at: now })
      .eq('clinic_id', clinicId)
      .select(SETTINGS_SELECT)
      .maybeSingle()

    if (error) throw toWriteError(error)
    if (data) return data

    const { data: inserted, error: insertError } = await this.client
      .from('clinic_settings')
      .insert({
        clinic_id: clinicId,
        business_hours:
          patch.business_hours ?? businessHoursToJson(DEFAULT_BUSINESS_HOURS),
        appointment_defaults: patch.appointment_defaults ?? {
          durationMinutes: DEFAULT_APPOINTMENT_DEFAULTS.durationMinutes,
        },
        /*
         * Branding e IA continuam fora desta fatia. Avisos operacionais já têm
         * controle e começam ligados para não silenciar eventos por omissão.
         */
        notification_prefs:
          patch.notification_prefs ?? { operational: true },
        branding: {},
        ai_enabled: false,
        updated_at: now,
      })
      .select(SETTINGS_SELECT)
      .maybeSingle()

    if (insertError) throw toWriteError(insertError)
    if (!inserted) throw notFound(clinicId)

    return inserted
  }
}

interface ClinicRow {
  id: string
  slug: string
  trade_name: string
  legal_name: string | null
  cnpj: string | null
  phone: string | null
  email: string | null
  /** `jsonb` — a forma é fechada por `parseStoredClinicAddress`, não aqui. */
  address: unknown
  timezone: string
  locale: string
}

function toProfile(row: ClinicRow): ClinicProfile {
  return {
    id: row.id,
    slug: row.slug,
    tradeName: row.trade_name,
    legalName: row.legal_name,
    cnpj: row.cnpj,
    phone: row.phone,
    email: row.email,
    // Relido pelo mesmo contrato com que foi escrito: conteúdo irreconhecível
    // vira endereço vazio, e o cadastro da clínica continua abrindo.
    address: parseStoredClinicAddress(row.address),
    timezone: row.timezone,
    locale: row.locale,
  }
}

/**
 * Interpreta a coluna `jsonb` e registra quando ela não foi entendida.
 *
 * A leitura em si é de `lib/clinic/business-hours`, compartilhada com a agenda
 * (A-02) — o que sobra aqui é o log, que é preocupação de infraestrutura.
 */
function readBusinessHours(value: Json | null | undefined) {
  const parsed = parseStoredBusinessHours(value)

  if (parsed.source === 'unrecognized') {
    console.error('[settings] business_hours em formato desconhecido')
  }

  return parsed
}

/**
 * Mesma leitura defensiva, sem o aviso na tela.
 *
 * A assimetria é deliberada: substituir uma duração padrão desconhecida custa um
 * número que a pessoa reescolhe em dois cliques. Substituir a semana inteira
 * custa uma configuração que ela talvez não saiba reconstruir.
 */
function parseAppointmentDefaults(
  value: Json | null | undefined,
): AppointmentDefaults {
  const parsed = storedAppointmentDefaultsSchema.safeParse(value)

  return parsed.success
    ? { durationMinutes: parsed.data.durationMinutes }
    : DEFAULT_APPOINTMENT_DEFAULTS
}

function notFound(clinicId: string): ClinicSettingsError {
  return new ClinicSettingsError(
    'not-found',
    `clinica ${clinicId} indisponivel para escrita`,
  )
}

/**
 * Traduz a recusa do Postgres.
 *
 * A mensagem sobe só para o LOG — em `clinics` o texto de erro pode ecoar razão
 * social e CNPJ, que são o cadastro da empresa, não dado de paciente, mas
 * também não têm o que fazer numa tela de erro.
 */
function toWriteError(error: {
  code?: string | null
  message?: string | null
}): ClinicSettingsError {
  const code = error.code ?? undefined
  const message = error.message ?? 'sem mensagem'

  if (code === '23505') {
    return new ClinicSettingsError('duplicate', message, code)
  }

  if (code === '42501' || code === 'PGRST301') {
    return new ClinicSettingsError('forbidden', message, code)
  }

  if (!code && /fetch|network|timeout|econnre/i.test(message)) {
    return new ClinicSettingsError('unavailable', message)
  }

  return new ClinicSettingsError('unexpected', message, code)
}
