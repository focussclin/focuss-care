import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import type { PatientTagColor } from '../domain/PatientTag'

export interface PatientTagRow {
  id: string
  clinic_id: string
  name: string
  color: PatientTagColor
  created_at: string
}

export interface PatientTagLinkRow {
  tag: PatientTagRow | null
}

export interface PatientTagRpcArgs {
  p_clinic_id: string
  p_patient_id: string
  p_name: string
  p_color: PatientTagColor
}

export interface PatientTagQueryError {
  code?: string | null
  message?: string | null
}

export interface PatientTagQueryResponse<T> {
  data: T
  error: PatientTagQueryError | null
}

export interface PatientTagQueryBuilder
  extends PromiseLike<PatientTagQueryResponse<readonly PatientTagLinkRow[] | null>> {
  select(columns: string): PatientTagQueryBuilder
  eq(column: string, value: string): PatientTagQueryBuilder
  order(column: string, options: { ascending: boolean }): PatientTagQueryBuilder
  delete(): PatientTagQueryBuilder
}

export type PatientTagRpcBuilder = PromiseLike<
  PatientTagQueryResponse<PatientTagRow | null>
>

export interface PatientTagClient {
  from(relation: 'patient_tag_links'): PatientTagQueryBuilder
  rpc(fn: 'add_patient_tag', args: PatientTagRpcArgs): PatientTagRpcBuilder
}

export function asPatientTagClient(
  client: SupabaseClient<Database>,
): PatientTagClient {
  return client as unknown as PatientTagClient
}
