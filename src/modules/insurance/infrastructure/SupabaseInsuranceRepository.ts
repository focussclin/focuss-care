import { preferredNameOfRow } from '@/lib/patients/preferred-name'
import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type {
  AuthorizationStatus,
  ClaimDenialStatus,
  Database,
  Json,
} from '@/lib/supabase/database.types'

import type {
  Authorization,
  AuthorizationAnswer,
  AuthorizationProcedure,
  AuthorizationSearchHit,
  ClaimDenial,
  ClaimDenialUpdate,
  ClaimInvoiceOption,
  InsurancePlan,
  InsuranceProvider,
  InsuranceSummary,
  NewAuthorizationData,
  NewClaimDenialData,
  NewPatientInsuranceData,
  NewPlanData,
  NewProviderData,
  PatientInsurance,
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
  patients ( full_name, social_name ),
  patient_insurances (
    card_number,
    insurance_plans (
      name,
      insurance_providers ( name )
    )
  )
`

/**
 * O recorte da BUSCA — sem `procedures` e sem `denial_reason`.
 *
 * Os dois são o conteúdo clínico da guia. Ver `searchAuthorizations`.
 */
const AUTHORIZATION_SEARCH_SELECT = `
  id,
  authorization_number,
  status,
  requested_at,
  patients ( full_name, social_name ),
  patient_insurances (
    insurance_plans (
      insurance_providers ( name )
    )
  )
`

const CLAIM_DENIAL_SELECT = `
  id,
  invoice_id,
  invoice_item_id,
  denial_code,
  reason,
  amount_cents,
  status,
  denied_at,
  appealed_at,
  resolved_at,
  recovered_cents,
  notes,
  invoices (
    number,
    patients ( full_name, social_name ),
    insurance_plans ( name )
  ),
  invoice_items ( description )
`

const PATIENT_INSURANCE_SELECT = `
  id,
  patient_id,
  insurance_plan_id,
  card_number,
  holder_name,
  valid_until,
  is_primary,
  is_active,
  patients ( full_name, social_name ),
  insurance_plans (
    name,
    insurance_providers ( name )
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
  patients: { full_name: string; social_name: string | null } | null
  patient_insurances: {
    card_number: string
    insurance_plans: {
      name: string
      insurance_providers: { name: string } | null
    } | null
  } | null
}

/** A linha da busca: os mesmos campos do `select` reduzido, e só eles. */
interface AuthorizationSearchRow {
  id: string
  authorization_number: string | null
  status: AuthorizationStatus
  requested_at: string
  patients: { full_name: string; social_name: string | null } | null
  patient_insurances: {
    insurance_plans: {
      insurance_providers: { name: string } | null
    } | null
  } | null
}

interface ClaimDenialRow {
  id: string
  invoice_id: string
  invoice_item_id: string | null
  denial_code: string | null
  reason: string
  amount_cents: number
  status: 'received' | 'appealing' | 'recovered' | 'accepted'
  denied_at: string
  appealed_at: string | null
  resolved_at: string | null
  recovered_cents: number | null
  notes: string | null
  invoices: {
    number: number | null
    patients: { full_name: string; social_name: string | null } | null
    insurance_plans: { name: string } | null
  } | null
  invoice_items: { description: string } | null
}

interface PatientInsuranceRow {
  id: string
  patient_id: string
  insurance_plan_id: string
  card_number: string
  holder_name: string | null
  valid_until: string | null
  is_primary: boolean
  is_active: boolean
  patients: { full_name: string; social_name: string | null } | null
  insurance_plans: {
    name: string
    insurance_providers: { name: string } | null
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

  /**
   * Busca de guia — por número da operadora ou por nome do paciente.
   *
   * # O que esta consulta NÃO lê
   *
   * `procedures` e `denial_reason` ficam fora do `select`. São o que a guia tem
   * de clínico: o primeiro diz o que se pretendia fazer com a pessoa, o segundo
   * é o texto da operadora sobre isso. A paleta é um campo aberto no cabeçalho
   * de toda tela autenticada, e o recorte é feito aqui — não na montagem do DTO,
   * porque coluna que não sai do banco não vaza de lugar nenhum.
   *
   * # Duas consultas, e nenhuma delas é `or()` entre tabelas
   *
   * O PostgREST não filtra por coluna de tabela embutida dentro de um `or` sem
   * transformar a leitura em algo que a RLS avalia de forma diferente. Duas
   * consultas independentes — uma pelo número, outra pelos pacientes cujo nome
   * casa — são previsíveis e mantêm o `clinic_id` explícito nas duas.
   *
   * A união é feita aqui, deduplicada por id: uma guia cujo número casa E cujo
   * paciente casa apareceria duas vezes na paleta, ocupando duas linhas do teto
   * com o mesmo registro.
   */
  async searchAuthorizations(
    clinicId: string,
    query: string,
    limit: number,
  ): Promise<AuthorizationSearchHit[]> {
    /*
     * Curinga de LIKE, gramática do PostgREST e parênteses saem do termo.
     * Mesmo saneamento das outras buscas do produto — `%` sozinho traria a base
     * inteira, e `,` quebraria a lista de filtros.
     */
    const cleanQuery = query.replace(/[\\%_*(),]/g, ' ').trim()
    if (!cleanQuery) return []

    const cap = Math.min(Math.max(Math.trunc(limit) || 1, 1), 20)

    const [byNumber, patients] = await Promise.all([
      this.client
        .from('insurance_authorizations')
        .select(AUTHORIZATION_SEARCH_SELECT)
        .eq('clinic_id', clinicId)
        .ilike('authorization_number', `%${cleanQuery}%`)
        .order('requested_at', { ascending: false })
        .limit(cap),
      this.client
        .from('patients')
        .select('id')
        .eq('clinic_id', clinicId)
        .ilike('full_name', `%${cleanQuery}%`)
        .limit(Math.min(Math.max(cap * 2, 1), 32)),
    ])

    if (byNumber.error) throw readFailure('searchAuthorizations', byNumber.error)
    if (patients.error) throw readFailure('searchAuthorizations', patients.error)

    const rows = [...((byNumber.data ?? []) as unknown as AuthorizationSearchRow[])]
    const patientIds = (patients.data ?? []).map((patient) => patient.id)

    if (patientIds.length > 0) {
      const { data, error } = await this.client
        .from('insurance_authorizations')
        .select(AUTHORIZATION_SEARCH_SELECT)
        .eq('clinic_id', clinicId)
        .in('patient_id', patientIds)
        .order('requested_at', { ascending: false })
        .limit(cap)

      if (error) throw readFailure('searchAuthorizations', error)

      rows.push(...((data ?? []) as unknown as AuthorizationSearchRow[]))
    }

    const unique = new Map<string, AuthorizationSearchRow>()
    for (const row of rows) unique.set(row.id, row)

    return [...unique.values()]
      .map(toAuthorizationSearchHit)
      .sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())
      .slice(0, cap)
  }

  async listClaimDenials(
    clinicId: string,
    limit: number,
  ): Promise<ClaimDenial[]> {
    const { data, error } = await this.client
      .from('insurance_claim_denials')
      .select(CLAIM_DENIAL_SELECT)
      .eq('clinic_id', clinicId)
      .order('denied_at', { ascending: false })
      .limit(limit)

    if (error) throw readFailure('listClaimDenials', error)

    return (data as unknown as ClaimDenialRow[]).map(toClaimDenial)
  }

  async listClaimInvoiceOptions(
    clinicId: string,
    limit: number,
  ): Promise<ClaimInvoiceOption[]> {
    const { data, error } = await this.client
      .from('invoices')
      .select(
        'id, number, total_cents, patients ( full_name, social_name ), insurance_plans ( name )',
      )
      .eq('clinic_id', clinicId)
      .eq('payer_type', 'insurance')
      .in('status', ['issued', 'partially_paid', 'paid', 'overdue'])
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw readFailure('listClaimInvoiceOptions', error)

    const rows = data as unknown as {
      id: string
      number: number | null
      total_cents: number
      patients: { full_name: string; social_name: string | null } | null
      insurance_plans: { name: string } | null
    }[]

    return rows.map((row) => ({
      id: row.id,
      patientName: preferredNameOfRow(row.patients, 'Paciente'),
      invoiceNumber: row.number,
      totalCents: row.total_cents,
      label: `Fatura ${row.number ? `nº ${row.number}` : row.id.slice(0, 8)} · ${
        preferredNameOfRow(row.patients, 'Paciente')
      } · ${row.insurance_plans?.name ?? 'Convênio'}`,
    }))
  }

  async createClaimDenial(
    clinicId: string,
    input: NewClaimDenialData,
    createdBy: string,
  ): Promise<ClaimDenial> {
    const { data: invoice, error: invoiceError } = await this.client
      .from('invoices')
      .select('id, payer_type, status, total_cents')
      .eq('clinic_id', clinicId)
      .eq('id', input.invoiceId)
      .eq('payer_type', 'insurance')
      .in('status', ['issued', 'partially_paid', 'paid', 'overdue'])
      .maybeSingle()

    if (invoiceError) throw toWriteError(invoiceError)
    if (!invoice) throw notFound(input.invoiceId)
    if (input.amountCents > invoice.total_cents) {
      throw new InsuranceRepositoryError(
        'claim-amount-exceeds-invoice',
        'valor glosado acima do total da fatura',
      )
    }

    const { data: row, error } = await this.client
      .from('insurance_claim_denials')
      .insert({
        clinic_id: clinicId,
        invoice_id: input.invoiceId,
        denial_code: input.denialCode,
        reason: input.reason,
        amount_cents: input.amountCents,
        status: 'received',
        denied_at: toDateOnly(input.deniedAt),
        notes: input.notes,
        created_by: createdBy,
      })
      .select('id')
      .single()

    if (error) throw toWriteError(error)

    return this.requireClaimDenial(clinicId, row.id)
  }

  async updateClaimDenial(
    clinicId: string,
    denialId: string,
    update: ClaimDenialUpdate,
  ): Promise<ClaimDenial> {
    const current = await this.requireClaimDenial(clinicId, denialId)
    assertClaimTransition(current.status, update.status)

    if (
      update.status === 'recovered' &&
      update.recoveredCents > current.amountCents
    ) {
      throw new InsuranceRepositoryError(
        'claim-recovery-exceeds-denial',
        'valor recuperado acima da glosa',
      )
    }

    const now = new Date().toISOString()
    const patch = {
      status: update.status,
      appealed_at:
        update.status === 'appealing'
          ? current.appealedAt?.toISOString() ?? now
          : current.appealedAt?.toISOString() ?? null,
      resolved_at:
        update.status === 'recovered' || update.status === 'accepted'
          ? now
          : current.resolvedAt?.toISOString() ?? null,
      recovered_cents:
        update.status === 'recovered'
          ? update.recoveredCents
          : current.recoveredCents,
      notes: update.notes,
      updated_at: now,
    }

    const { data, error } = await this.client
      .from('insurance_claim_denials')
      .update(patch)
      .eq('clinic_id', clinicId)
      .eq('id', denialId)
      // Compare-and-swap: duas pessoas não podem avançar a mesma glosa
      // partindo de estados diferentes.
      .eq('status', current.status)
      .select('id')
      .maybeSingle()

    if (error) throw toWriteError(error)
    if (!data) throw new InsuranceRepositoryError('claim-already-resolved', 'glosa já encerrada')

    return this.requireClaimDenial(clinicId, denialId)
  }

  async listPatientInsurances(
    clinicId: string,
  ): Promise<PatientInsuranceOption[]> {
    const { data, error } = await this.client
      .from('patient_insurances')
      .select(
        'id, card_number, valid_until, patients ( full_name, social_name ), insurance_plans ( name )',
      )
      .eq('clinic_id', clinicId)
      .eq('is_active', true)
      .limit(ROW_CAP)

    if (error) throw readFailure('listPatientInsurances', error)

    const rows = data as unknown as {
      id: string
      card_number: string
      valid_until: string | null
      patients: { full_name: string; social_name: string | null } | null
      insurance_plans: { name: string } | null
    }[]

    return rows.map((row) => ({
      id: row.id,
      patientName: preferredNameOfRow(row.patients, 'Paciente'),
      planName: row.insurance_plans?.name ?? 'Plano',
      cardNumber: row.card_number,
      validUntil: row.valid_until ? new Date(`${row.valid_until}T00:00:00`) : null,
    }))
  }

  async listPatientInsuranceRecords(
    clinicId: string,
  ): Promise<PatientInsurance[]> {
    const { data, error } = await this.client
      .from('patient_insurances')
      .select(PATIENT_INSURANCE_SELECT)
      .eq('clinic_id', clinicId)
      .order('is_active', { ascending: false })
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(ROW_CAP)

    if (error) throw readFailure('listPatientInsuranceRecords', error)

    return ((data ?? []) as unknown as PatientInsuranceRow[]).map(
      toPatientInsurance,
    )
  }

  async createPatientInsurance(
    clinicId: string,
    data: NewPatientInsuranceData,
  ): Promise<PatientInsurance> {
    const [patientResult, planResult] = await Promise.all([
      this.client
        .from('patients')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('id', data.patientId)
        .is('deleted_at', null)
        .maybeSingle(),
      this.client
        .from('insurance_plans')
        .select('id')
        .eq('clinic_id', clinicId)
        .eq('id', data.planId)
        .eq('is_active', true)
        .maybeSingle(),
    ])

    if (patientResult.error) throw toWriteError(patientResult.error)
    if (planResult.error) throw toWriteError(planResult.error)
    if (!patientResult.data || !planResult.data) {
      throw new InsuranceRepositoryError('not-found', 'paciente ou plano indisponivel')
    }

    // Sem uma constraint parcial verificada no schema, manter uma única primária
    // é uma regra explícita da aplicação. A linha nova só entra depois disso.
    if (data.isPrimary) {
      const { error } = await this.client
        .from('patient_insurances')
        .update({ is_primary: false, updated_at: new Date().toISOString() })
        .eq('clinic_id', clinicId)
        .eq('patient_id', data.patientId)
        .eq('is_primary', true)
        .eq('is_active', true)

      if (error) throw toWriteError(error)
    }

    const { data: row, error } = await this.client
      .from('patient_insurances')
      .insert({
        clinic_id: clinicId,
        patient_id: data.patientId,
        insurance_plan_id: data.planId,
        card_number: data.cardNumber,
        holder_name: data.holderName,
        valid_until: data.validUntil ? toDateOnly(data.validUntil) : null,
        is_primary: data.isPrimary,
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .select(PATIENT_INSURANCE_SELECT)
      .single()

    if (error) throw toWriteError(error)

    return toPatientInsurance(row as unknown as PatientInsuranceRow)
  }

  async setPatientInsuranceActive(
    clinicId: string,
    insuranceId: string,
    isActive: boolean,
  ): Promise<PatientInsurance> {
    const { data: row, error } = await this.client
      .from('patient_insurances')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('clinic_id', clinicId)
      .eq('id', insuranceId)
      .select(PATIENT_INSURANCE_SELECT)
      .maybeSingle()

    if (error) throw toWriteError(error)
    if (!row) throw notFound(insuranceId)

    return toPatientInsurance(row as unknown as PatientInsuranceRow)
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

  /**
   * Compare-and-swap, igual ao da resposta.
   *
   * `.eq('status', from)` é a trava: se alguém baixou ou cancelou a guia nesse
   * intervalo, o UPDATE não encontra linha e nada é sobrescrito. `answered_at`
   * e `denial_reason` não são tocados — baixar uma guia não apaga a resposta da
   * operadora.
   */
  async transitionAuthorization(
    clinicId: string,
    authorizationId: string,
    from: AuthorizationStatus,
    to: AuthorizationStatus,
  ): Promise<Authorization> {
    const { data, error } = await this.client
      .from('insurance_authorizations')
      .update({ status: to, updated_at: new Date().toISOString() })
      .eq('clinic_id', clinicId)
      .eq('id', authorizationId)
      .eq('status', from)
      .select('id')
      .maybeSingle()

    if (error) throw toWriteError(error)
    if (!data) {
      throw new InsuranceRepositoryError(
        'already-answered',
        `guia ${authorizationId} nao esta mais em ${from} nesta clinica`,
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

  private async requireClaimDenial(
    clinicId: string,
    denialId: string,
  ): Promise<ClaimDenial> {
    const { data, error } = await this.client
      .from('insurance_claim_denials')
      .select(CLAIM_DENIAL_SELECT)
      .eq('clinic_id', clinicId)
      .eq('id', denialId)
      .maybeSingle()

    if (error) throw toWriteError(error)
    if (!data) throw notFound(denialId)

    return toClaimDenial(data as unknown as ClaimDenialRow)
  }
}

function toPatientInsurance(row: PatientInsuranceRow): PatientInsurance {
  return {
    id: row.id,
    patientId: row.patient_id,
    patientName: preferredNameOfRow(row.patients, 'Paciente'),
    planId: row.insurance_plan_id,
    planName: row.insurance_plans?.name ?? 'Plano',
    providerName: row.insurance_plans?.insurance_providers?.name ?? 'Operadora',
    cardNumber: row.card_number,
    holderName: row.holder_name,
    validUntil: row.valid_until
      ? new Date(`${row.valid_until}T00:00:00`)
      : null,
    isPrimary: row.is_primary,
    isActive: row.is_active,
  }
}

function toAuthorization(row: AuthorizationRow): Authorization {
  const plan = row.patient_insurances?.insurance_plans

  return {
    id: row.id,
    patientId: row.patient_id,
    patientName: preferredNameOfRow(row.patients, 'Paciente'),
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

function toAuthorizationSearchHit(
  row: AuthorizationSearchRow,
): AuthorizationSearchHit {
  return {
    id: row.id,
    patientName: preferredNameOfRow(row.patients, 'Paciente'),
    authorizationNumber: row.authorization_number,
    status: row.status,
    providerName:
      row.patient_insurances?.insurance_plans?.insurance_providers?.name ??
      'Operadora',
    requestedAt: new Date(row.requested_at),
  }
}

function toClaimDenial(row: ClaimDenialRow): ClaimDenial {
  return {
    id: row.id,
    invoiceId: row.invoice_id,
    invoiceNumber: row.invoices?.number ?? null,
    patientName: preferredNameOfRow(row.invoices?.patients),
    planName: row.invoices?.insurance_plans?.name ?? 'Convênio',
    invoiceItemDescription: row.invoice_items?.description ?? null,
    denialCode: row.denial_code,
    reason: row.reason,
    amountCents: row.amount_cents,
    status: row.status,
    deniedAt: new Date(`${row.denied_at}T00:00:00`),
    appealedAt: row.appealed_at ? new Date(row.appealed_at) : null,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at) : null,
    recoveredCents: row.recovered_cents,
    notes: row.notes,
  }
}

function assertClaimTransition(
  current: ClaimDenialStatus,
  next: ClaimDenialUpdate['status'],
): void {
  if (current === 'recovered' || current === 'accepted') {
    throw new InsuranceRepositoryError(
      'claim-already-resolved',
      'glosa ja encerrada',
    )
  }

  const valid =
    (current === 'received' && (next === 'appealing' || next === 'accepted')) ||
    (current === 'appealing' && (next === 'recovered' || next === 'accepted'))

  if (!valid) {
    throw new InsuranceRepositoryError(
      'claim-invalid-transition',
      `transicao de glosa ${current} para ${next} invalida`,
    )
  }
}

/** `Date` -> `YYYY-MM-DD`, sem deslocar o dia por fuso. */
function toDateOnly(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
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
