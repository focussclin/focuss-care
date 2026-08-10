import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import type {
  DocumentListQuery,
  DocumentRepository,
} from '../domain/DocumentRepository'
import type {
  NewPatientDocumentData,
  PatientDocument,
} from '../domain/Document'
import { DocumentRepositoryError } from '../domain/DocumentRepositoryError'
import {
  asDocumentsClient,
  type DocumentQueryError,
  type PatientDocumentRow,
} from './documentsDatabase'

const DOCUMENT_SELECT = `
  id,
  clinic_id,
  patient_id,
  kind,
  storage_path,
  file_name,
  mime_type,
  size_bytes,
  uploaded_by,
  created_at,
  patient:patients!patient_documents_patient_id_fkey(id, full_name)
`

const DOCUMENT_ROW_CAP = 200

export class SupabaseDocumentRepository implements DocumentRepository {
  private readonly client

  constructor(client: SupabaseClient<Database>) {
    this.client = asDocumentsClient(client)
  }

  async list(clinicId: string, query: DocumentListQuery): Promise<PatientDocument[]> {
    let request = this.client
      .from('patient_documents')
      .select(DOCUMENT_SELECT)
      .eq('clinic_id', clinicId)

    if (query.kind) request = request.eq('kind', query.kind)
    if (query.patientId) request = request.eq('patient_id', query.patientId)

    const { data, error } = await request
      .order('created_at', { ascending: false })
      .limit(DOCUMENT_ROW_CAP)

    if (error) throw toDocumentError(error)

    return (data ?? []).map((row) => toDocument(row as unknown as PatientDocumentRow))
  }

  async findById(clinicId: string, documentId: string): Promise<PatientDocument | null> {
    const { data, error } = await this.client
      .from('patient_documents')
      .select(DOCUMENT_SELECT)
      .eq('clinic_id', clinicId)
      .eq('id', documentId)
      .maybeSingle()

    if (error) throw toDocumentError(error)
    return data ? toDocument(data as unknown as PatientDocumentRow) : null
  }

  async create(
    clinicId: string,
    data: NewPatientDocumentData,
  ): Promise<PatientDocument> {
    const { data: row, error } = await this.client
      .from('patient_documents')
      .insert({
        clinic_id: clinicId,
        patient_id: data.patientId,
        kind: data.kind,
        storage_path: data.storagePath,
        file_name: data.fileName,
        mime_type: data.mimeType,
        size_bytes: data.sizeBytes,
        uploaded_by: data.uploadedBy,
      })
      .select(DOCUMENT_SELECT)
      .single()

    if (error) throw toDocumentError(error)
    if (!row) throw new DocumentRepositoryError('not-found', 'documento indisponível')

    return toDocument(row as unknown as PatientDocumentRow)
  }
}

function toDocument(row: PatientDocumentRow): PatientDocument {
  return {
    id: row.id,
    patientId: row.patient_id,
    patientName: row.patient?.full_name ?? 'Paciente não localizado',
    kind: row.kind,
    storagePath: row.storage_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    uploadedBy: row.uploaded_by,
    createdAt: new Date(row.created_at),
  }
}

function toDocumentError(error: DocumentQueryError): DocumentRepositoryError {
  const code = error.code ?? undefined
  const message = error.message?.toLowerCase() ?? ''

  if (code === '42P01' || code === 'PGRST205') {
    return new DocumentRepositoryError('schema-not-ready', 'patient_documents ausente', code)
  }
  if (code === '42501') {
    return new DocumentRepositoryError('forbidden', 'recusado pela policy', code)
  }
  if (code === 'PGRST116') {
    return new DocumentRepositoryError('not-found', 'documento indisponível', code)
  }
  if (code === 'PGRST301' || code === 'PGRST000' || message.includes('fetch')) {
    return new DocumentRepositoryError('unavailable', 'serviço indisponível', code)
  }

  return new DocumentRepositoryError('unexpected', 'falha ao acessar documentos', code)
}
