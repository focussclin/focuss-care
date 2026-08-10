import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import type { FormResponseStatus, FormAnswers } from '../domain/FormResponse'

/** Tipos locais enquanto `20260809_clinic_forms.sql` não está aplicada. */
export interface FormResponseRow {
  id: string
  clinic_id: string
  form_id: string
  patient_id: string
  status: FormResponseStatus
  answers: FormAnswers
  submitted_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export interface FormResponseInsert {
  clinic_id: string
  form_id: string
  patient_id: string
  status: FormResponseStatus
  answers: FormAnswers
  submitted_at: string | null
  created_by: string
}

export interface FormResponseUpdate {
  status?: FormResponseStatus
  answers?: FormAnswers
  submitted_at?: string | null
  updated_at?: string
}

export interface FormResponseQueryError {
  code?: string | null
  message?: string | null
}

export interface FormResponseQueryResponse<T> {
  data: T
  error: FormResponseQueryError | null
}

export interface FormResponseQueryBuilder
  extends PromiseLike<FormResponseQueryResponse<readonly FormResponseRow[] | null>> {
  eq(column: string, value: string): FormResponseQueryBuilder
  select(columns: string): FormResponseQueryBuilder
  insert(values: FormResponseInsert): FormResponseQueryBuilder
  update(values: FormResponseUpdate): FormResponseQueryBuilder
  single(): PromiseLike<FormResponseQueryResponse<FormResponseRow | null>>
  maybeSingle(): PromiseLike<FormResponseQueryResponse<FormResponseRow | null>>
}

export interface FormResponsesClient {
  from(relation: 'clinic_form_responses'): FormResponseQueryBuilder
}

export function asFormResponsesClient(
  client: SupabaseClient<Database>,
): FormResponsesClient {
  return client as unknown as FormResponsesClient
}
