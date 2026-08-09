import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_BUSINESS_HOURS } from '@/lib/clinic/business-hours'
import { SupabaseClinicSettingsRepository } from './SupabaseClinicSettingsRepository'

/**
 * Contrato das configurações (C-01).
 *
 * O que este arquivo protege é sobretudo uma perda silenciosa: `business_hours`
 * é uma coluna `jsonb`, sem forma garantida pelo banco, e a diferença entre
 * "vazio" e "formato que não reconheço" decide se a tela avisa antes de
 * sobrescrever a semana inteira. Nenhum dos dois casos aparece em uso normal —
 * que é exatamente o tipo de coisa que ninguém testa à mão.
 *
 * Sem banco e sem rede. Tenancy real continua sendo pgTAP (R1).
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'

interface RecordedCall {
  query: number
  table: string
  method: string
  args: unknown[]
}

function clinicRow(overrides: Record<string, unknown> = {}) {
  return {
    id: CLINIC,
    slug: 'clinica-vida',
    trade_name: 'Clínica Vida',
    legal_name: null,
    cnpj: null,
    timezone: 'America/Sao_Paulo',
    locale: 'pt-BR',
    ...overrides,
  }
}

const storedDays = [
  { weekday: 1, closed: false, opensAt: '07:00', closesAt: '19:00' },
  { weekday: 2, closed: false, opensAt: '07:00', closesAt: '19:00' },
  { weekday: 3, closed: false, opensAt: '07:00', closesAt: '19:00' },
  { weekday: 4, closed: false, opensAt: '07:00', closesAt: '19:00' },
  { weekday: 5, closed: false, opensAt: '07:00', closesAt: '19:00' },
  { weekday: 6, closed: true, opensAt: '08:00', closesAt: '12:00' },
  { weekday: 7, closed: true, opensAt: '08:00', closesAt: '12:00' },
]

function createFakeClient(results: {
  clinic?: unknown
  clinicUpdate?: unknown
  settings?: unknown
  /** O UPDATE de clinic_settings encontrou linha? */
  settingsUpdate?: unknown
  inserted?: unknown
  /** Erro devolvido pela primeira operação de escrita na tabela indicada. */
  failWith?: { table: string; code: string }
}) {
  const calls: RecordedCall[] = []
  let queryIndex = -1

  const from = vi.fn((table: string) => {
    queryIndex += 1
    const index = queryIndex

    const query: Record<string, unknown> = {}
    const methodsOf = () =>
      calls.filter((call) => call.query === index).map((call) => call.method)

    for (const method of [
      'select',
      'eq',
      'neq',
      'is',
      'order',
      'update',
      'insert',
      'delete',
    ]) {
      query[method] = (...args: unknown[]) => {
        calls.push({ query: index, table, method, args })
        return query
      }
    }

    query.maybeSingle = async () => {
      calls.push({ query: index, table, method: 'maybeSingle', args: [] })
      const methods = methodsOf()

      if (results.failWith?.table === table && methods.includes('update')) {
        return { data: null, error: { code: results.failWith.code, message: 'x' } }
      }

      if (table === 'clinics') {
        if (methods.includes('update')) {
          return {
            data: 'clinicUpdate' in results ? results.clinicUpdate : clinicRow(),
            error: null,
          }
        }
        return {
          data: 'clinic' in results ? results.clinic : clinicRow(),
          error: null,
        }
      }

      if (methods.includes('insert')) {
        return {
          data:
            'inserted' in results
              ? results.inserted
              : { business_hours: {}, appointment_defaults: {} },
          error: null,
        }
      }

      if (methods.includes('update')) {
        return {
          data: 'settingsUpdate' in results ? results.settingsUpdate : null,
          error: null,
        }
      }

      return {
        data: 'settings' in results ? results.settings : null,
        error: null,
      }
    }

    return query
  })

  return {
    calls,
    client: { from } as never,
    ofTable: (table: string) => calls.filter((call) => call.table === table),
  }
}

describe('load — horário guardado em jsonb', () => {
  it('coluna vazia é AUSÊNCIA de configuração, não formato errado', async () => {
    // `clinic_settings.business_hours` é NOT NULL: clínica recém-criada tem `{}`
    // ali. Marcar isso como desconhecido faria toda clínica nova abrir a tela
    // com um aviso de perda iminente — e aviso que aparece sempre ninguém lê.
    const fake = createFakeClient({
      settings: { business_hours: {}, appointment_defaults: {} },
    })

    const settings = await new SupabaseClinicSettingsRepository(
      fake.client,
    ).load(CLINIC)

    expect(settings.businessHoursSource).toBe('default')
    expect(settings.businessHours).toEqual(DEFAULT_BUSINESS_HOURS)
  })

  it('formato desconhecido AVISA em vez de fingir que não havia nada', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = createFakeClient({
      settings: {
        business_hours: { seg: '08h às 18h' },
        appointment_defaults: {},
      },
    })

    const settings = await new SupabaseClinicSettingsRepository(
      fake.client,
    ).load(CLINIC)

    // Sem este estado, o primeiro clique em "Salvar" apagaria uma configuração
    // que nunca chegou a aparecer na tela.
    expect(settings.businessHoursSource).toBe('unrecognized')
    expect(settings.businessHours).toEqual(DEFAULT_BUSINESS_HOURS)

    spy.mockRestore()
  })

  it('formato reconhecido volta como está', async () => {
    const fake = createFakeClient({
      settings: {
        business_hours: { days: storedDays },
        appointment_defaults: { durationMinutes: 45 },
        notification_prefs: { operational: false },
      },
    })

    const settings = await new SupabaseClinicSettingsRepository(
      fake.client,
    ).load(CLINIC)

    expect(settings.businessHoursSource).toBe('stored')
    expect(settings.businessHours[0]).toEqual(storedDays[0])
    expect(settings.appointmentDefaults.durationMinutes).toBe(45)
    expect(settings.notificationPreferences.operational).toBe(false)
  })

  it('falha ao ler a preferência não derruba a identidade da clínica', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = createFakeClient({ settings: null })

    const settings = await new SupabaseClinicSettingsRepository(
      fake.client,
    ).load(CLINIC)

    expect(settings.profile.tradeName).toBe('Clínica Vida')
    expect(settings.businessHoursSource).toBe('default')

    spy.mockRestore()
  })

  it('clínica de outra assinatura vira not-found', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = createFakeClient({ clinic: null })

    await expect(
      new SupabaseClinicSettingsRepository(fake.client).load(CLINIC),
    ).rejects.toMatchObject({ reason: 'not-found' })

    spy.mockRestore()
  })
})

describe('updateBusinessHours', () => {
  it('grava a semana inteira e nunca apaga linha', async () => {
    const fake = createFakeClient({
      settingsUpdate: {
        business_hours: { days: storedDays },
        appointment_defaults: {},
      },
    })

    await new SupabaseClinicSettingsRepository(fake.client).updateBusinessHours(
      CLINIC,
      DEFAULT_BUSINESS_HOURS,
    )

    const calls = fake.ofTable('clinic_settings')

    expect(calls.some((call) => call.method === 'delete')).toBe(false)
    expect(calls).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['clinic_id', CLINIC] }),
    )

    const update = calls.find((call) => call.method === 'update')
      ?.args[0] as Record<string, unknown>

    expect(update.business_hours).toEqual({
      days: DEFAULT_BUSINESS_HOURS.map((day) => ({ ...day })),
    })
  })

  it('cria a linha quando ela não existe, sem inventar as demais colunas', async () => {
    // `create_clinic()` deveria tê-la criado — "deveria" é o mais longe que se
    // pode ir sem ler o corpo da RPC (bloqueio B1).
    const fake = createFakeClient({
      settingsUpdate: null,
      inserted: {
        business_hours: { days: storedDays },
        appointment_defaults: { durationMinutes: 30 },
      },
    })

    await new SupabaseClinicSettingsRepository(fake.client).updateBusinessHours(
      CLINIC,
      DEFAULT_BUSINESS_HOURS,
    )

    const insert = fake
      .ofTable('clinic_settings')
      .find((call) => call.method === 'insert')?.args[0] as Record<
      string,
      unknown
    >

    expect(insert).toBeDefined()
    expect(insert.clinic_id).toBe(CLINIC)
    // Avisos começam ativos; branding e IA seguem fora desta fatia.
    expect(insert.notification_prefs).toEqual({ operational: true })
    expect(insert.branding).toEqual({})
    expect(insert.ai_enabled).toBe(false)
  })

  it('tenta UPDATE antes de INSERT', async () => {
    const fake = createFakeClient({
      settingsUpdate: {
        business_hours: { days: storedDays },
        appointment_defaults: {},
      },
    })

    await new SupabaseClinicSettingsRepository(fake.client).updateBusinessHours(
      CLINIC,
      DEFAULT_BUSINESS_HOURS,
    )

    // No caminho comum a linha existe, e assim nunca se depende de haver policy
    // de INSERT em `clinic_settings`.
    expect(
      fake.ofTable('clinic_settings').some((call) => call.method === 'insert'),
    ).toBe(false)
  })
})

describe('updateNotificationPreferences', () => {
  it('persiste o estado operacional no tenant ativo', async () => {
    const fake = createFakeClient({
      settingsUpdate: {
        business_hours: {},
        appointment_defaults: {},
        notification_prefs: { operational: false },
      },
    })

    const preferences =
      await new SupabaseClinicSettingsRepository(
        fake.client,
      ).updateNotificationPreferences(CLINIC, { operational: false })

    expect(preferences.operational).toBe(false)
    expect(fake.ofTable('clinic_settings')).toContainEqual(
      expect.objectContaining({
        method: 'eq',
        args: ['clinic_id', CLINIC],
      }),
    )
    expect(
      fake
        .ofTable('clinic_settings')
        .find((call) => call.method === 'update')?.args[0],
    ).toMatchObject({ notification_prefs: { operational: false } })
  })
})

describe('updateProfile', () => {
  it('recusa clínica arquivada e filtra pelo tenant', async () => {
    const fake = createFakeClient({})

    await new SupabaseClinicSettingsRepository(fake.client).updateProfile(
      CLINIC,
      { tradeName: 'Clínica Vida', legalName: null, cnpj: null },
    )

    const calls = fake.ofTable('clinics')

    expect(calls).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['id', CLINIC] }),
    )
    expect(calls).toContainEqual(
      expect.objectContaining({ method: 'is', args: ['deleted_at', null] }),
    )
  })

  it('CNPJ já usado por outra clínica vira duplicate, não erro genérico', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = createFakeClient({ failWith: { table: 'clinics', code: '23505' } })

    await expect(
      new SupabaseClinicSettingsRepository(fake.client).updateProfile(CLINIC, {
        tradeName: 'Clínica Vida',
        legalName: null,
        cnpj: '11222333000181',
      }),
    ).rejects.toMatchObject({ reason: 'duplicate' })

    spy.mockRestore()
  })

  it('RLS recusando vira forbidden', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = createFakeClient({ failWith: { table: 'clinics', code: '42501' } })

    await expect(
      new SupabaseClinicSettingsRepository(fake.client).updateProfile(CLINIC, {
        tradeName: 'Clínica Vida',
        legalName: null,
        cnpj: null,
      }),
    ).rejects.toMatchObject({ reason: 'forbidden' })

    spy.mockRestore()
  })
})
