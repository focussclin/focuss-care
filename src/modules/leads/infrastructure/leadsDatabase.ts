import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import type { LeadStage } from '../domain/Lead'

/** Tipos locais enquanto `20260809_clinic_leads.sql` não foi aplicada. */
export interface LeadRow {
  id: string
  clinic_id: string
  name: string
  phone: string | null
  email: string | null
  source: string
  campaign: string | null
  interest: string | null
  stage: LeadStage
  potential_value_cents: number | null
  next_action_at: string | null
  notes: string | null
  assigned_to: string | null
  created_by: string | null
  converted_patient_id: string | null
  created_at: string
  updated_at: string
  assigned: { id: string; full_name: string } | null
  converted_patient: { id: string; full_name: string } | null
}

export interface LeadInsert {
  clinic_id: string
  name: string
  phone: string | null
  email: string | null
  source: string
  campaign: string | null
  interest: string | null
  stage: LeadStage
  potential_value_cents: number | null
  next_action_at: string | null
  notes: string | null
  assigned_to: string | null
  created_by: string | null
}

export interface LeadUpdate {
  name?: string
  phone?: string | null
  email?: string | null
  source?: string
  campaign?: string | null
  interest?: string | null
  stage?: LeadStage
  potential_value_cents?: number | null
  next_action_at?: string | null
  notes?: string | null
  assigned_to?: string | null
  updated_at?: string
}

export interface LeadEventInsert {
  clinic_id: string
  lead_id: string
  from_stage: LeadStage | null
  to_stage: LeadStage
  created_by: string
}

export interface LeadQueryError {
  code?: string | null
  message?: string | null
}

export interface LeadQueryResponse<T> {
  data: T
  error: LeadQueryError | null
}

export interface LeadQueryBuilder
  extends PromiseLike<LeadQueryResponse<readonly LeadRow[] | null>> {
  eq(column: string, value: string): LeadQueryBuilder
  order(column: string, options: { ascending: boolean }): LeadQueryBuilder
  limit(count: number): LeadQueryBuilder
  select(columns: string): LeadQueryBuilder
  insert(values: LeadInsert | LeadEventInsert): LeadQueryBuilder
  update(values: LeadUpdate): LeadQueryBuilder
  single(): PromiseLike<LeadQueryResponse<LeadRow | null>>
  maybeSingle(): PromiseLike<LeadQueryResponse<LeadRow | null>>
}

export interface LeadsClient {
  from(relation: 'clinic_leads' | 'lead_events'): LeadQueryBuilder
}

export function asLeadsClient(client: SupabaseClient<Database>): LeadsClient {
  return client as unknown as LeadsClient
}
