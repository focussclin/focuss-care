import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { AuthorizationStatus, Database, Json } from '@/lib/supabase/database.types'

import type {
  Authorization,
  AuthorizationAnswer,
  AuthorizationProcedure,
  InsurancePlan,
  InsuranceProvider,
  InsuranceSummary,
  NewAuthorizationData,
  NewPlanData,
  NewProviderData,
  PatientInsuranceOption,
} from '../domain/Insurance'
import type { InsuranceRepository } from '../domain/InsuranceRepository'
import { InsuranceRepositoryError } from '../domain/InsuranceRepositoryError'
import { storedProceduresSchema } from '../schemas/insurance.schema'

type Client = SupabaseClient<Database>

const ROW_CAP = 500

const AUTHORIZATION_SELECT = `
  id,
  patient_id,
  authorization_number,
  status,
  procedures,
  requested_at,
  answered_at,
  expires_at,
  denial_reason,
  patients ( full_name ),
  patient_insurances (
    card_number,
    insurance_plans (
      name,
      insurance_providers ( name )
    )
  )
`

interface AuthorizationRow {
  id: string
  patient_id: string
  authorization_number: string | null
  status: AuthorizationStatus
  procedures: Json
  requested_at: string
  answered_at: string | null
  expires_at: string | null
  denial_reason: string | null
  patients: { full_name: string } | null
  patient_insurances: {
    card_number: string
    insurance_plans: {
      name: string
      insurance_providers: { name: string } | null
    } | null
  } | null
}

/**
 * Adapter de convênios — feature **V-01**.
 *
 * Toda leitura e escrita filtra `clinic_id` explicitamente. A RLS impede o
 * vazamento; o filtro impede a operação errada — e transforma "linha de outra
 * clínica" em "não encontrado" em vez de "atualizou zero linhas em silêncio".
 */
export class SupabaseInsuranceRepository implements InsuranceRepository {
  constructor(private readonly client: Client) {}

  async listProviders(clinicId: string): Promise<InsuranceProvider[]> {
    const [providersResult, plansResult] = await Promise.all([
      this.client
        .from('insurance_providers')
        .select('id, name, ans_code, cnpj, is_active, notes')
        .eq('clinic_id', clinicId)
        .order('name', { ascending: true })
        .limit(ROW_CAP),
      this.client
        .from('insurance_plans')
        .select('provider_id, is_active')
        .eq('clinic_id', clinicId)
        .limit(ROW_CAP),
    ])

    if (providersResult.error) {
      throw readFailure('listProviders', providersResult.error)
    }

    /*
     * A contagem de planos vem de uma consulta separada, e não de um agregado.
     *
     * O PostgREST não agrupa sem view, e o número aqui é pequeno: uma clínica
     * trabalha com dezenas de planos, não milhares. Contar em memória é exato e
     * evita uma migration só para exibir um número na lista.
     */
    const activePlans = new Map<string, number>()
    for (const plan of plansResult.data ?? []) {
      if (!plan.is_active) continue
      activePlans.set(plan.provider_id, (activePlans.get(plan.provider_id) ?? 0) + 1)
    }

    return (providersResult.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      ansCode: row.ans_code,
      cnpj: row.cnpj,
      isActive: row.is_active,
      notes: row.notes,
      activePlans: activePlans.get(row.id) ?? 0,
    }))
  }

  async listPlans(clinicId: string): Promise<InsurancePlan[]> {
    const { data, error } = await this.client
      .from('insurance_plans')
      .select(
        'id, provider_id, name, plan_code, copay_cents, payment_term_days, is_active, insurance_providers ( name )',
      )
      .eq('clinic_id', clinicId)
      .order('name', { ascending: true })
      .limit(ROW_CAP)

    if (error) throw readFailure('listPlans', error)

    const rows = data as unknown as {
      id: string
      provider_id: string
      name: string
      plan_code: string | null
      copay_cents: number
      payment_term_days: number
      is_active: boolean
      insurance_providers: { name: string } | null
    }[]

    return rows.map((row) => ({
      id: row.id,
      providerId: row.provider_id,
      providerName: row.insurance_providers?.name ?? 'Operadora',
      name: row.name,
      planCode: row.plan_code,
      copayCents: row.copay_cents,
      paymentTermDays: row.payment_term_days,
      isActive: row.is_active,
    }))
  }

  async listAuthorizations(
    clinicId: string,
    limit: number,
  ): Promise<Authorization[]> {
    const { data, error } = await this.client
      .from('insurance_authorizations')
      .select(AUTHORIZATION_SELECT)
      .eq('clinic_id', clinicId)
      .order('requested_at', { ascending: false })
      .limit(limit)

    if (error) throw readFailure('listAuthorizations', error)

    return (data as unknown as AuthorizationRow[]).map(toAuthorization)
  }

  async listPatientInsurances(
    clinicId: string,
  ): Promise<PatientInsuranceOption[]> {
    const { data, error } = await this.client
      .from('patient_insurances')
      .select(
        'id, card_number, valid_until, patients ( full_name ), insurance_plans ( name )',
      )
      .eq('clinic_id', clinicId)
      .eq('is_active', true)
      .limit(ROW_CAP)

    if (error) throw readFailure('listPatientInsurances', error)

    const rows = data as unknown as {
      id: string
      card_number: string
      valid_until: string | null
      patients: { full_name: string } | null
      insurance_plans: { name: string } | null
    }[]

    return rows.map((row) => ({
      id: row.id,
      patientName: row.patients?.full_name ?? 'Paciente',
      planName: row.insurance_plans?.name ?? 'Plano',
      cardNumber: row.card_number,
      validUntil: row.valid_until ? new Date(`${row.valid_until}T00:00:00`) : null,
    }))
  }

  async summary(clinicId: string): Promise<InsuranceSummary> {
    const count = async (
      table: 'insurance_providers' | 'insurance_plans',
    ): Promise<number> => {
      const { count: total, error } = await this.client
        .from(table)
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .eq('is_active', true)

      if (error) throw readFailure('summary', error)

      return total ?? 0
    }

    const countAuthorizations = async (
      status: AuthorizationStatus,
    ): Promise<number> => {
      const { count: total, error } = await this.client
        .from('insurance_authorizations')
        .select('id', { count: 'exact', head: true })
        .eq('clinic_id', clinicId)
        .eq('status', status)

      if (error) throw readFailure('summary', error)

      return total ?? 0
    }

    const [activeProviders, activePlans, pending, denied] = await Promise.all([
      count('insurance_providers'),
      count('insurance_plans'),
      countAuthorizations('requested'),
      countAuthorizations('denied'),
    ])

    return {
      activeProviders,
      activePlans,
      pendingAuthorizations: pending,
      deniedAuthorizations: denied,
    }
  }

  async createProvider(
    clinicId: string,
    data: NewProviderData,
  ): Promise<InsuranceProvider> {
    const { data: row, error } = await this.client
      .from('insurance_providers')
      .insert({
        clinic_id: clinicId,
        name: data.name,
        ans_code: data.ansCode,
        cnpj: data.cnpj,
        // `contact` é NOT NULL e esta fatia não cadastra telefone nem e-mail da
        // operadora: objeto vazio é o valor honesto, não um placeholder.
        contact: {},
        notes: data.notes,
        is_active: true,
      })
      .select('id, name, ans_code, cnpj, is_active, notes')
      .single()

    if (error) throw toWriteError(error)

    return {
      id: row.id,
      name: row.name,
      ansCode: row.ans_code,
      cnpj: row.cnpj,
      isActive: row.is_active,
      notes: row.notes,
      activePlans: 0,
    }
  }

  async setProviderActive(
    clinicId: string,
    providerId: string,
    isActive: boolean,
  ): Promise<InsuranceProvider> {
    const { data: row, error } = await this.client
      .from('insurance_providers')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('clinic_id', clinicId)
      .eq('id', providerId)
      .select('id, name, ans_code, cnpj, is_active, notes')
      .maybeSingle()

    if (error) throw toWriteError(error)
    if (!row) throw notFound(providerId)

    /*
     * Os planos NÃO são desativados junto.
     *
     * Desativar a operadora diz "paramos de trabalhar com ela"; apagar o estado
     * dos planos perderia a informação de quais estavam ativos, e reativar a
     * operadora depois não saberia o que restaurar.
     */
    return {
      id: row.id,
      name: row.name,
      ansCode: row.ans_code,
      cnpj: row.cnpj,
      isActive: row.is_active,
      notes: row.notes,
      activePlans: 0,
    }
  }

  async createPlan(
    clinicId: string,
    data: NewPlanData,
  ): Promise<InsurancePlan> {
    const { data: row, error } = await this.client
      .from('insurance_plans')
      .insert({
        clinic_id: clinicId,
        provider_id: data.providerId,
        name: data.name,
        plan_code: data.planCode,
        copay_cents: data.copayCents,
        payment_term_days: data.paymentTermDays,
        is_active: true,
      })
      .select(
        'id, provider_id, name, plan_code, copay_cents, payment_term_days, is_active, insurance_providers ( name )',
      )
      .single()

    if (error) throw toWriteError(error)

    const plan = row as unknown as {
      id: string
      provider_id: string
      name: string
      plan_code: string | null
      copay_cents: number
      payment_term_days: number
      is_active: boolean
      insurance_providers: { name: string } | null
    }

    return {
      id: plan.id,
      providerId: plan.provider_id,
      providerName: plan.insurance_providers?.name ?? 'Operadora',
      name: plan.name,
      planCode: plan.plan_code,
      copayCents: plan.copay_cents,
      paymentTermDays: plan.payment_term_days,
      isActive: plan.is_active,
    }
  }

  async createAuthorization(
    clinicId: string,
    data: NewAuthorizationData,
    createdBy: string,
  ): Promise<Authorization> {
    /*
     * `patient_id` sai da CARTEIRINHA, não da entrada.
     *
     * A guia precisa dos dois, e recebê-los separados do cliente permitiria
     * pedir autorização para o paciente A usando a carteirinha do paciente B —
     * o que a operadora recusaria, mas só depois do atendimento marcado.
     */
    const { data: card, error: cardError } = await this.client
      .from('patient_insurances')
      .select('patient_id')
      .eq('clinic_id', clinicId)
      .eq('id', data.patientInsuranceId)
      .eq('is_active', true)
      .maybeSingle()

    if (cardError) throw toWriteError(cardError)
    if (!card) throw notFound(data.patientInsuranceId)

    const { data: row, error } = await this.client
      .from('insurance_authorizations')
      .insert({
        clinic_id: clinicId,
        patient_id: card.patient_id,
        patient_insurance_id: data.patientInsuranceId,
        // Nasce SEM número: o número vem da operadora. Inventá-lo produziria
        // uma guia que o faturamento rejeita depois do atendimento feito.
        status: 'requested',
        procedures: data.procedures.map((procedure) => ({
          code: procedure.code,
          description: procedure.description,
          quantity: procedure.quantity,
        })),
        requested_at: new Date().toISOString(),
        notes: data.notes,
        created_by: createdBy,
      })
      .select('id')
      .single()

    if (error) throw toWriteError(error)

    return this.requireAuthorization(clinicId, row.id)
  }

  async answerAuthorization(
    clinicId: string,
    authorizationId: string,
    answer: AuthorizationAnswer,
  ): Promise<Authorization> {
    const now = new Date().toISOString()

    const patch =
      answer.outcome === 'approved'
        ? {
            status: 'approved' as const,
            authorization_number: answer.authorizationNumber,
            expires_at: answer.expiresAt?.toISOString() ?? null,
            denial_reason: null,
            answered_at: now,
            updated_at: now,
          }
        : {
            status: 'denied' as const,
            denial_reason: answer.denialReason,
            answered_at: now,
            updated_at: now,
          }

    const { data, error } = await this.client
      .from('insurance_authorizations')
      .update(patch)
      .eq('clinic_id', clinicId)
      .eq('id', authorizationId)
      /*
       * Só guia pendente aceita resposta.
       *
       * Reescrever uma já respondida apagaria o motivo da negativa — o texto
       * que a clínica usa para recorrer. O filtro no `where` também impede que
       * duas pessoas respondendo ao mesmo tempo sobrescrevam uma à outra: a
       * segunda não encontra linha.
       */
      .eq('status', 'requested')
      .select('id')
      .maybeSingle()

    if (error) throw toWriteError(error)
    if (!data) {
      throw new InsuranceRepositoryError(
        'already-answered',
        `guia ${authorizationId} nao esta pendente nesta clinica`,
      )
    }

    return this.requireAuthorization(clinicId, authorizationId)
  }

  private async requireAuthorization(
    clinicId: string,
    authorizationId: string,
  ): Promise<Authorization> {
    const { data, error } = await this.client
      .from('insurance_authorizations')
      .select(AUTHORIZATION_SELECT)
      .eq('clinic_id', clinicId)
      .eq('id', authorizationId)
      .maybeSingle()

    if (error) throw toWriteError(error)
    if (!data) throw notFound(authorizationId)

    return toAuthorization(data as unknown as AuthorizationRow)
  }
}

function toAuthorization(row: AuthorizationRow): Authorization {
  const plan = row.patient_insurances?.insurance_plans

  return {
    id: row.id,
    patientId: row.patient_id,
    patientName: row.patients?.full_name ?? 'Paciente',
    planName: plan?.name ?? 'Plano',
    providerName: plan?.insurance_providers?.name ?? 'Operadora',
    authorizationNumber: row.authorization_number,
    status: row.status,
    procedures: parseProcedures(row.procedures),
    requestedAt: new Date(row.requested_at),
    answeredAt: row.answered_at ? new Date(row.answered_at) : null,
    expiresAt: row.expires_at ? new Date(row.expires_at) : null,
    denialReason: row.denial_reason,
  }
}

/**
 * `procedures` é `jsonb` livre — lido com o mesmo contrato com que foi escrito.
 *
 * Formato desconhecido devolve lista vazia, e não uma linha inventada: a guia
 * continua aparecendo com seu status e seu número, que é o que a recepção
 * precisa para ligar na operadora. Fabricar um procedimento a partir de JSON
 * ilegível seria pior que mostrar nenhum.
 */
function parseProcedures(value: Json): readonly AuthorizationProcedure[] {
  const parsed = storedProceduresSchema.safeParse(value)

  if (!parsed.success) {
    console.error('[insurance] procedures em formato desconhecido')
    return []
  }

  return parsed.data
}

function notFound(id: string): InsuranceRepositoryError {
  return new InsuranceRepositoryError(
    'not-found',
    `registro ${id} indisponivel nesta clinica`,
  )
}

function readFailure(context: string, error: { code?: string | null }): Error {
  console.error(`[insurance] ${context}`, { code: error.code ?? null })

  return new Error('Não foi possível carregar os convênios.')
}

/**
 * Traduz a recusa do Postgres.
 *
 * A mensagem sobe só para o LOG: o texto pode ecoar valores enviados, e aqui
 * eles incluem número de carteirinha — dado pessoal do paciente.
 */
function toWriteError(error: {
  code?: string | null
  message?: string | null
}): InsuranceRepositoryError {
  const code = error.code ?? undefined
  const message = error.message ?? 'sem mensagem'

  if (code === '23505') {
    return new InsuranceRepositoryError('duplicate', message, code)
  }

  if (code === '23503') {
    return new InsuranceRepositoryError('not-found', message, code)
  }

  if (code === '42501' || code === 'PGRST301') {
    return new InsuranceRepositoryError('forbidden', message, code)
  }

  if (!code && /fetch|network|timeout|econnre/i.test(message)) {
    return new InsuranceRepositoryError('unavailable', message)
  }

  return new InsuranceRepositoryError('unexpected', message, code)
}
