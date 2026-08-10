import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import type { Form, FormStatus, FormUpdateData, NewFormData } from '../domain/Form'
import type { FormRepository } from '../domain/FormRepository'
import { FormRepositoryError } from '../domain/FormRepositoryError'
import {
  asFormsClient,
  type FormQueryError,
  type FormRow,
  type FormsClient,
  type FormUpdate,
} from './formsDatabase'

const FORM_SELECT = `
  id,
  clinic_id,
  name,
  description,
  form_type,
  status,
  fields,
  version,
  created_by,
  updated_by,
  created_at,
  updated_at
`

const FORM_ROW_CAP = 100

function toForm(row: FormRow): Form {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.form_type,
    status: row.status,
    fields: row.fields,
    version: row.version,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

export class SupabaseFormRepository implements FormRepository {
  private readonly client: FormsClient

  constructor(client: SupabaseClient<Database>) {
    this.client = asFormsClient(client)
  }

  async list(clinicId: string): Promise<Form[]> {
    const { data, error } = await this.client
      .from('clinic_forms')
      .select(FORM_SELECT)
      .eq('clinic_id', clinicId)
      .order('updated_at', { ascending: false })
      .limit(FORM_ROW_CAP)

    if (error) throw toFormError(error)

    return (data ?? []).map((row) => toForm(row as unknown as FormRow))
  }

  async findById(clinicId: string, formId: string): Promise<Form | null> {
    const { data, error } = await this.client
      .from('clinic_forms')
      .select(FORM_SELECT)
      .eq('clinic_id', clinicId)
      .eq('id', formId)
      .maybeSingle()

    if (error) throw toFormError(error)
    return data ? toForm(data as unknown as FormRow) : null
  }

  async create(
    clinicId: string,
    createdBy: string,
    data: NewFormData,
  ): Promise<Form> {
    const { data: row, error } = await this.client
      .from('clinic_forms')
      .insert({
        clinic_id: clinicId,
        name: data.name,
        description: data.description,
        form_type: data.type,
        status: data.status,
        fields: data.fields,
        version: 1,
        created_by: createdBy,
        updated_by: createdBy,
      })
      .select(FORM_SELECT)
      .single()

    if (error) throw toFormError(error)
    if (!row) throw notFound()

    return toForm(row as unknown as FormRow)
  }

  async update(
    clinicId: string,
    formId: string,
    updatedBy: string,
    data: FormUpdateData,
  ): Promise<Form> {
    const patch: FormUpdate = {
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    }

    if (data.name !== undefined) patch.name = data.name
    if (data.description !== undefined) patch.description = data.description
    if (data.type !== undefined) patch.form_type = data.type
    if (data.status !== undefined) patch.status = data.status

    /*
     * Mudar os CAMPOS incrementa a versão. Mudar nome, descrição ou situação
     * não.
     *
     * `clinic_forms.version` existia na migration, aparecia na entidade e no
     * DTO, e **nada a escrevia**: ficava em 1 para sempre. O número era exibido
     * na tela como se significasse alguma coisa.
     *
     * O que ele significa: `clinic_form_responses.answers` é um objeto chaveado
     * por id de campo. Uma resposta coletada quando o formulário tinha as
     * perguntas A e B é lida depois contra as perguntas A e C — e sem a versão
     * ninguém consegue saber sob qual questionário aquela anamnese foi
     * respondida. Em dado clínico isso não é detalhe de auditoria: é a
     * diferença entre uma resposta interpretável e uma resposta órfã.
     *
     * O `findById` a mais só acontece quando os campos mudam — ou seja, ao
     * salvar o construtor, e não a cada renomeação.
     */
    if (data.fields !== undefined) {
      const current = await this.findById(clinicId, formId)
      if (!current) throw notFound()

      const fieldsChanged =
        JSON.stringify(current.fields) !== JSON.stringify(data.fields)

      if (fieldsChanged) {
        patch.fields = data.fields
        patch.version = current.version + 1
      }
    }

    const { data: row, error } = await this.client
      .from('clinic_forms')
      .update(patch)
      .eq('clinic_id', clinicId)
      .eq('id', formId)
      .select(FORM_SELECT)
      .maybeSingle()

    if (error) throw toFormError(error)
    if (!row) throw notFound()

    return toForm(row as unknown as FormRow)
  }

  async setStatus(
    clinicId: string,
    formId: string,
    updatedBy: string,
    status: FormStatus,
  ): Promise<Form> {
    return this.update(clinicId, formId, updatedBy, { status })
  }
}

function notFound(): FormRepositoryError {
  return new FormRepositoryError('not-found', 'formulário indisponível')
}

function toFormError(error: FormQueryError): FormRepositoryError {
  const code = error.code ?? undefined

  if (code === '42P01' || code === 'PGRST205') {
    return new FormRepositoryError('schema-not-ready', 'clinic_forms ausente', code)
  }

  if (code === '42501') {
    return new FormRepositoryError('forbidden', 'recusado pela policy', code)
  }

  if (code === 'PGRST116') return notFound()

  if (
    code === 'PGRST301' ||
    code === 'PGRST000' ||
    error.message?.toLowerCase().includes('fetch')
  ) {
    return new FormRepositoryError('unavailable', 'serviço indisponível', code)
  }

  return new FormRepositoryError('unexpected', 'falha ao acessar formulário', code)
}
