import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import type { FormField, FormStatus, FormType } from '../domain/Form'

/** Tipos locais enquanto `20260809_clinic_forms.sql` não está aplicada. */
export interface FormRow {
  id: string
  clinic_id: string
  name: string
  description: string | null
  form_type: FormType
  status: FormStatus
  fields: readonly FormField[]
  version: number
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

export interface FormInsert {
  clinic_id: string
  name: string
  description: string | null
  form_type: FormType
  status: FormStatus
  fields: readonly FormField[]
  version: number
  created_by: string
  updated_by: string
}

export interface FormUpdate {
  name?: string
  description?: string | null
  form_type?: FormType
  status?: FormStatus
  fields?: readonly FormField[]
  version?: number
  updated_by?: string
  updated_at?: string
}

export interface FormQueryError {
  code?: string | null
  message?: string | null
}

export interface FormQueryResponse<T> {
  data: T
  error: FormQueryError | null
}

export interface FormQueryBuilder
  extends PromiseLike<FormQueryResponse<readonly FormRow[] | null>> {
  eq(column: string, value: string): FormQueryBuilder
  order(column: string, options: { ascending: boolean }): FormQueryBuilder
  limit(count: number): FormQueryBuilder
  select(columns: string): FormQueryBuilder
  insert(values: FormInsert): FormQueryBuilder
  update(values: FormUpdate): FormQueryBuilder
  single(): PromiseLike<FormQueryResponse<FormRow | null>>
  maybeSingle(): PromiseLike<FormQueryResponse<FormRow | null>>
}

export interface FormsClient {
  from(relation: 'clinic_forms'): FormQueryBuilder
}

export function asFormsClient(client: SupabaseClient<Database>): FormsClient {
  return client as unknown as FormsClient
}
