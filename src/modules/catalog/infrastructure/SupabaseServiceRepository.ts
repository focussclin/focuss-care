import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import type { NewServiceData, Service, ServiceUpdateData } from '../domain/Service'
import {
  ServiceRepositoryError,
  type ServiceRepository,
} from '../domain/ServiceRepository'

type Client = SupabaseClient<Database>

const SERVICE_SELECT =
  'id, clinic_id, code, tuss_code, name, description, category, default_duration_minutes, default_price_cents, requires_authorization, is_active, updated_at, deleted_at'

const SERVICE_CAP = 500

interface ServiceRow {
  id: string
  code: string | null
  tuss_code: string | null
  name: string
  description: string | null
  category: string | null
  default_duration_minutes: number | null
  default_price_cents: number
  requires_authorization: boolean
  is_active: boolean
  updated_at: string
}

function toService(row: ServiceRow): Service {
  return {
    id: row.id,
    code: row.code,
    tussCode: row.tuss_code,
    name: row.name,
    description: row.description,
    category: row.category,
    defaultDurationMinutes: row.default_duration_minutes,
    defaultPriceCents: row.default_price_cents,
    requiresAuthorization: row.requires_authorization,
    isActive: row.is_active,
    updatedAt: new Date(row.updated_at),
  }
}

function toPayload(data: NewServiceData) {
  return {
    code: data.code,
    tuss_code: data.tussCode,
    name: data.name,
    description: data.description,
    category: data.category,
    default_duration_minutes: data.defaultDurationMinutes,
    default_price_cents: data.defaultPriceCents,
    requires_authorization: data.requiresAuthorization,
  }
}

export class SupabaseServiceRepository implements ServiceRepository {
  constructor(private readonly client: Client) {}

  /**
   * O catálogo exclui o que foi apagado logicamente.
   *
   * `deleted_at is null` é o filtro inteiro. A linha continua no banco porque
   * `invoice_items.service_id` pode apontar para ela — apagar de verdade
   * deixaria faturas antigas sem saber o que foi cobrado —, mas ela não volta
   * a aparecer para quem monta uma cobrança nova.
   */
  async list(clinicId: string): Promise<Service[]> {
    const { data, error } = await this.client
      .from('services')
      .select(SERVICE_SELECT)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .order('name', { ascending: true })
      .limit(SERVICE_CAP)

    if (error) throw toServiceError(error)
    return (data ?? []).map((row) => toService(row as unknown as ServiceRow))
  }

  async create(clinicId: string, data: NewServiceData): Promise<Service> {
    const { data: row, error } = await this.client
      .from('services')
      .insert({ clinic_id: clinicId, is_active: true, ...toPayload(data) })
      .select(SERVICE_SELECT)
      .single()

    if (error) throw toServiceError(error)
    if (!row) throw new ServiceRepositoryError('unexpected', 'insert sem retorno')
    return toService(row as unknown as ServiceRow)
  }

  async update(
    clinicId: string,
    serviceId: string,
    data: ServiceUpdateData,
  ): Promise<Service> {
    return this.patch(clinicId, serviceId, {
      ...toPayload(data),
      updated_at: new Date().toISOString(),
    })
  }

  async setActive(
    clinicId: string,
    serviceId: string,
    isActive: boolean,
  ): Promise<Service> {
    return this.patch(clinicId, serviceId, {
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
  }

  async softDelete(clinicId: string, serviceId: string): Promise<void> {
    await this.patch(clinicId, serviceId, {
      deleted_at: new Date().toISOString(),
      /*
       * Desativa junto, e de propósito.
       *
       * A leitura já filtra `deleted_at is null`, mas qualquer consulta futura
       * que esqueça o filtro encontraria um serviço "ativo" que ninguém pode
       * escolher. Os dois campos concordando removem essa armadilha.
       */
      is_active: false,
      updated_at: new Date().toISOString(),
    })
  }

  /**
   * UPDATE que distingue "sumiu" de "a policy recusou".
   *
   * `services` já existe no banco aplicado com RLS ativa, mas a verificação
   * registrada em `docs/03-banco-de-dados.md` cobriu leitura anônima, não
   * escrita autenticada. Sem policy de UPDATE, zero linhas mudam sem erro.
   *
   * A releitura NÃO filtra `deleted_at`: um serviço já apagado ainda existe
   * como linha, e chamá-lo de "não encontrado" seria verdade para o catálogo e
   * mentira para o banco — quem tentar apagar duas vezes precisa ouvir a
   * diferença.
   */
  private async patch(
    clinicId: string,
    serviceId: string,
    patch: Database['public']['Tables']['services']['Update'],
  ): Promise<Service> {
    const { data, error } = await this.client
      .from('services')
      .update(patch)
      .eq('clinic_id', clinicId)
      .eq('id', serviceId)
      .select(SERVICE_SELECT)
      .maybeSingle()

    if (error) throw toServiceError(error)
    if (data) return toService(data as unknown as ServiceRow)

    const { data: existing, error: readError } = await this.client
      .from('services')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('id', serviceId)
      .maybeSingle()

    if (readError) throw toServiceError(readError)
    if (existing) {
      throw new ServiceRepositoryError(
        'write-forbidden',
        'o serviço é legível mas a escrita foi recusada',
      )
    }
    throw new ServiceRepositoryError('not-found', 'serviço indisponível nesta clínica')
  }
}

function toServiceError(error: {
  code?: string | null
  message?: string | null
}): ServiceRepositoryError {
  const code = error.code ?? undefined
  const message = error.message ?? ''

  if (code === '42501' || code === 'PGRST301') {
    return new ServiceRepositoryError('forbidden', 'recusado pela policy', code)
  }
  /*
   * Se o banco tiver índice único por (clínica, código), a segunda entrada bate
   * aqui. A aplicação checa antes para dar mensagem melhor, mas a checagem dela
   * tem janela de corrida — esta não tem.
   */
  if (code === '23505') {
    return new ServiceRepositoryError('duplicate', 'código já usado', code)
  }
  if (/fetch|network|timeout|econnrefused/i.test(message)) {
    return new ServiceRepositoryError('unavailable', 'falha de conexão', code)
  }
  return new ServiceRepositoryError('unexpected', 'falha ao acessar o catálogo', code)
}
