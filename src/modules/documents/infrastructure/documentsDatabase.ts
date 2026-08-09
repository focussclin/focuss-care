import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import type { DocumentKind } from '../domain/Document'

export interface PatientDocumentRow {
  id: string
  clinic_id: string
  patient_id: string
  kind: DocumentKind
  storage_path: string
  file_name: string
  mime_type: string | null
  size_bytes: number | null
  uploaded_by: string | null
  created_at: string
  patient: { id: string; full_name: string } | null
}

export interface PatientDocumentInsert {
  clinic_id: string
  patient_id: string
  kind: DocumentKind
  storage_path: string
  file_name: string
  mime_type: string | null
  size_bytes: number | null
  uploaded_by: string
}

export interface DocumentQueryError {
  code?: string | null
  message?: string | null
}

export interface DocumentQueryResponse<T> {
  data: T
  error: DocumentQueryError | null
}

export interface DocumentQueryBuilder
  extends PromiseLike<DocumentQueryResponse<readonly PatientDocumentRow[] | null>> {
  select(columns: string): DocumentQueryBuilder
  eq(column: string, value: string): DocumentQueryBuilder
  order(column: string, options: { ascending: boolean }): DocumentQueryBuilder
  limit(count: number): DocumentQueryBuilder
  insert(values: PatientDocumentInsert): DocumentQueryBuilder
  single(): PromiseLike<DocumentQueryResponse<PatientDocumentRow | null>>
  maybeSingle(): PromiseLike<DocumentQueryResponse<PatientDocumentRow | null>>
}

export interface DocumentsClient {
  from(relation: 'patient_documents'): DocumentQueryBuilder
}

export function asDocumentsClient(
  client: SupabaseClient<Database>,
): DocumentsClient {
  return client as unknown as DocumentsClient
}

export const DOCUMENT_BUCKET = 'patient-documents'
