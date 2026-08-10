import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import type {
  Lead,
  LeadStage,
  LeadUpdateData,
  NewLeadData,
} from '../domain/Lead'
import type { LeadRepository } from '../domain/LeadRepository'
import { LeadRepositoryError } from '../domain/LeadRepositoryError'
import {
  asLeadsClient,
  type LeadQueryError,
  type LeadRow,
  type LeadsClient,
  type LeadUpdate,
} from './leadsDatabase'

const LEAD_SELECT = `
  id,
  clinic_id,
  name,
  phone,
  email,
  source,
  campaign,
  interest,
  stage,
  potential_value_cents,
  next_action_at,
  notes,
  assigned_to,
  created_by,
  converted_patient_id,
  created_at,
  updated_at,
  assigned:profiles ( id, full_name ),
  converted_patient:patients ( id, full_name )
`

const LEAD_ROW_CAP = 300

export class SupabaseLeadRepository implements LeadRepository {
  private readonly client: LeadsClient

  constructor(private readonly baseClient: SupabaseClient<Database>) {
    this.client = asLeadsClient(baseClient)
  }

  async list(clinicId: string): Promise<Lead[]> {
    const { data, error } = await this.client
      .from('clinic_leads')
      .select(LEAD_SELECT)
      .eq('clinic_id', clinicId)
      .order('updated_at', { ascending: false })
      .limit(LEAD_ROW_CAP)

    if (error) throw toLeadError(error)
    return (data ?? []).map((row) => toLead(row as unknown as LeadRow))
  }

  async create(
    clinicId: string,
    createdBy: string,
    data: NewLeadData,
  ): Promise<Lead> {
    const { data: row, error } = await this.client
      .from('clinic_leads')
      .insert({
        clinic_id: clinicId,
        name: data.name,
        phone: data.phone,
        email: data.email,
        source: data.source,
        campaign: data.campaign,
        interest: data.interest,
        stage: data.stage,
        potential_value_cents: data.potentialValueCents,
        next_action_at: data.nextActionAt?.toISOString() ?? null,
        notes: data.notes,
        assigned_to: data.assignedToId,
        created_by: createdBy,
      })
      .select(LEAD_SELECT)
      .single()

    if (error) throw toLeadError(error)
    if (!row) throw notFound()
    return toLead(row as unknown as LeadRow)
  }

  async update(
    clinicId: string,
    leadId: string,
    changedBy: string,
    data: LeadUpdateData,
  ): Promise<Lead> {
    const current = await this.require(clinicId, leadId)
    const patch: LeadUpdate = { updated_at: new Date().toISOString() }

    if (data.name !== undefined) patch.name = data.name
    if (data.phone !== undefined) patch.phone = data.phone
    if (data.email !== undefined) patch.email = data.email
    if (data.source !== undefined) patch.source = data.source
    if (data.campaign !== undefined) patch.campaign = data.campaign
    if (data.interest !== undefined) patch.interest = data.interest
    if (data.stage !== undefined) patch.stage = data.stage
    if (data.potentialValueCents !== undefined) {
      patch.potential_value_cents = data.potentialValueCents
    }
    if (data.nextActionAt !== undefined) {
      patch.next_action_at = data.nextActionAt?.toISOString() ?? null
    }
    if (data.notes !== undefined) patch.notes = data.notes
    if (data.assignedToId !== undefined) patch.assigned_to = data.assignedToId

    const { data: row, error } = await this.client
      .from('clinic_leads')
      .update(patch)
      .eq('clinic_id', clinicId)
      .eq('id', leadId)
      .select(LEAD_SELECT)
      .maybeSingle()

    if (error) throw toLeadError(error)
    if (!row) throw notFound()

    const lead = toLead(row as unknown as LeadRow)
    if (data.stage !== undefined && data.stage !== current.stage) {
      await this.recordStageEvent(clinicId, leadId, changedBy, current.stage, data.stage)
    }
    return lead
  }

  async setStage(
    clinicId: string,
    leadId: string,
    changedBy: string,
    stage: LeadStage,
  ): Promise<Lead> {
    const current = await this.require(clinicId, leadId)
    if (current.stage === stage) return current

    const { data: row, error } = await this.client
      .from('clinic_leads')
      .update({ stage, updated_at: new Date().toISOString() })
      .eq('clinic_id', clinicId)
      .eq('id', leadId)
      .select(LEAD_SELECT)
      .maybeSingle()

    if (error) throw toLeadError(error)
    if (!row) throw notFound()

    await this.recordStageEvent(clinicId, leadId, changedBy, current.stage, stage)
    return toLead(row as unknown as LeadRow)
  }

  async convert(
    clinicId: string,
    leadId: string,
  ): Promise<{ patientId: string }> {
    /*
     * `clinicId` NÃO é enviado.
     *
     * A função resolve a clínica por `current_clinic_id()` e recusa lead de
     * outra — mesmo desenho de `create_patient_portal_invite`. Mandá-lo daqui
     * daria ao chamador a chance de escolher o tenant, e esta operação cria uma
     * ficha de paciente: o tenant errado seria uma pessoa cadastrada na clínica
     * de outra gente.
     *
     * O parâmetro continua na assinatura porque a PORTA é a mesma para
     * qualquer adapter, e um que não tivesse `current_clinic_id()` precisaria
     * dele.
     */
    void clinicId

    const { data, error } = await this.client.rpc('convert_lead_to_patient', {
      p_lead_id: leadId,
    })

    if (error) throw toLeadError(error)

    if (!data) {
      throw new LeadRepositoryError(
        'unexpected',
        'a conversão não devolveu o paciente criado',
      )
    }

    return { patientId: data }
  }

  private async require(clinicId: string, leadId: string): Promise<Lead> {
    const { data, error } = await this.client
      .from('clinic_leads')
      .select(LEAD_SELECT)
      .eq('clinic_id', clinicId)
      .eq('id', leadId)
      .maybeSingle()

    if (error) throw toLeadError(error)
    if (!data) throw notFound()
    return toLead(data as unknown as LeadRow)
  }

  private async recordStageEvent(
    clinicId: string,
    leadId: string,
    createdBy: string,
    fromStage: LeadStage,
    toStage: LeadStage,
  ): Promise<void> {
    const { error } = await this.client.from('lead_events').insert({
      clinic_id: clinicId,
      lead_id: leadId,
      from_stage: fromStage,
      to_stage: toStage,
      created_by: createdBy,
    })

    if (error) throw toLeadError(error)
  }
}

function toLead(row: LeadRow): Lead {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    source: row.source,
    campaign: row.campaign,
    interest: row.interest,
    stage: row.stage,
    potentialValueCents: row.potential_value_cents,
    nextActionAt: row.next_action_at ? new Date(row.next_action_at) : null,
    notes: row.notes,
    assignedTo: row.assigned
      ? { id: row.assigned.id, name: row.assigned.full_name }
      : null,
    convertedPatientId: row.converted_patient_id,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

function notFound(): LeadRepositoryError {
  return new LeadRepositoryError('not-found', 'lead indisponível')
}

function toLeadError(error: LeadQueryError): LeadRepositoryError {
  const code = error.code ?? undefined
  const message = error.message ?? ''

  /*
   * `42883`/`PGRST202` entram junto com `42P01`: função ausente é o mesmo
   * "migration não aplicada" que tabela ausente, e a conversão é RPC.
   */
  if (
    code === '42P01' ||
    code === 'PGRST205' ||
    code === '42883' ||
    code === 'PGRST202'
  ) {
    return new LeadRepositoryError('schema-not-ready', 'clinic_leads ausente', code)
  }

  /*
   * Converter duas vezes tem ação própria: abrir a ficha que já existe.
   *
   * Sem este ramo, o segundo clique responderia "falha inesperada" sobre uma
   * operação que na verdade já deu certo — e alguém tentaria de novo, ou
   * criaria o paciente à mão, duplicando a pessoa no cadastro.
   */
  if (message.includes('ALREADY_CONVERTED') || code === '23505') {
    return new LeadRepositoryError(
      'already-converted',
      'lead já convertido',
      code,
    )
  }

  if (message.includes('LEAD_NOT_FOUND')) {
    return new LeadRepositoryError('not-found', 'lead ausente', code)
  }
  if (code === '42501') {
    return new LeadRepositoryError('forbidden', 'operação recusada pela policy', code)
  }
  if (code === '23503') {
    return new LeadRepositoryError('not-found', 'referência inexistente', code)
  }
  if (/fetch|network|timeout|econnrefused/i.test(message)) {
    return new LeadRepositoryError('unavailable', 'falha de conexão', code)
  }
  return new LeadRepositoryError('unexpected', 'falha na consulta', code)
}
