import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import type {
  FormResponse,
  FormResponseUpdateData,
  NewFormResponseData,
} from '../domain/FormResponse'
import type { FormResponseRepository } from '../domain/FormResponseRepository'
import { FormResponseRepositoryError } from '../domain/FormResponseRepositoryError'
import {
  asFormResponsesClient,
  type FormResponseQueryError,
  type FormResponseRow,
  type FormResponsesClient,
  type FormResponseUpdate,
} from './formResponsesDatabase'

const RESPONSE_SELECT = `
  id,
  clinic_id,
  form_id,
  patient_id,
  status,
  answers,
  submitted_at,
  created_by,
  created_at,
  updated_at
`

function toFormResponse(row: FormResponseRow): FormResponse {
  return {
    id: row.id,
    formId: row.form_id,
    patientId: row.patient_id,
    status: row.status,
    answers: row.answers,
    submittedAt: row.submitted_at ? new Date(row.submitted_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

export class SupabaseFormResponseRepository implements FormResponseRepository {
  private readonly client: FormResponsesClient

  constructor(client: SupabaseClient<Database>) {
    this.client = asFormResponsesClient(client)
  }

  async create(
    clinicId: string,
    createdBy: string,
    data: NewFormResponseData,
  ): Promise<FormResponse> {
    const submittedAt = data.status === 'submitted' ? new Date().toISOString() : null
    const { data: row, error } = await this.client
      .from('clinic_form_responses')
      .insert({
        clinic_id: clinicId,
        form_id: data.formId,
        patient_id: data.patientId,
        status: data.status,
        answers: data.answers,
        submitted_at: submittedAt,
        created_by: createdBy,
      })
      .select(RESPONSE_SELECT)
      .single()

    if (error) throw toResponseError(error)
    if (!row) throw notFound()
    return toFormResponse(row as unknown as FormResponseRow)
  }

  async update(
    clinicId: string,
    responseId: string,
    formId: string,
    data: FormResponseUpdateData,
  ): Promise<FormResponse> {
    const patch: FormResponseUpdate = {
      updated_at: new Date().toISOString(),
    }
    if (data.status !== undefined) patch.status = data.status
    if (data.answers !== undefined) patch.answers = data.answers
    if (data.status !== undefined) {
      patch.submitted_at = data.status === 'submitted' ? new Date().toISOString() : null
    }

    const { data: row, error } = await this.client
      .from('clinic_form_responses')
      .update(patch)
      .eq('clinic_id', clinicId)
      .eq('id', responseId)
      .eq('form_id', formId)
      .select(RESPONSE_SELECT)
      .maybeSingle()

    if (error) throw toResponseError(error)
    if (!row) throw notFound()
    return toFormResponse(row as unknown as FormResponseRow)
  }
}

function notFound(): FormResponseRepositoryError {
  return new FormResponseRepositoryError('not-found', 'resposta indisponível')
}

function toResponseError(error: FormResponseQueryError): FormResponseRepositoryError {
  const code = error.code ?? undefined
  if (code === '42P01' || code === 'PGRST205') {
    return new FormResponseRepositoryError('schema-not-ready', 'clinic_form_responses ausente', code)
  }
  if (code === '42501') {
    return new FormResponseRepositoryError('forbidden', 'recusado pela policy', code)
  }
  if (code === '23503' || code === '23505') {
    return new FormResponseRepositoryError('conflict', 'referência da resposta inválida', code)
  }
  if (code === 'PGRST301' || code === 'PGRST000' || error.message?.toLowerCase().includes('fetch')) {
    return new FormResponseRepositoryError('unavailable', 'serviço indisponível', code)
  }
  return new FormResponseRepositoryError('unexpected', 'falha ao acessar resposta', code)
}
