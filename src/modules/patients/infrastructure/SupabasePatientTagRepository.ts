import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import type { AddPatientTagData, PatientTag } from '../domain/PatientTag'
import type { PatientTagRepository } from '../domain/PatientTagRepository'
import { PatientTagRepositoryError } from '../domain/PatientTagRepositoryError'
import {
  asPatientTagClient,
  type PatientTagQueryError,
  type PatientTagRow,
} from './patientTagsDatabase'

const TAG_SELECT =
  'tag:patient_tags!patient_tag_links_tag_id_fkey(id, clinic_id, name, color, created_at)'

export class SupabasePatientTagRepository implements PatientTagRepository {
  private readonly client

  constructor(client: SupabaseClient<Database>) {
    this.client = asPatientTagClient(client)
  }

  async listByPatient(clinicId: string, patientId: string): Promise<PatientTag[]> {
    const { data, error } = await this.client
      .from('patient_tag_links')
      .select(TAG_SELECT)
      .eq('clinic_id', clinicId)
      .eq('patient_id', patientId)
      .order('created_at', { ascending: true })

    if (error) throw toTagError(error)

    return (data ?? [])
      .map((row) => row.tag)
      .filter((tag): tag is PatientTagRow => Boolean(tag))
      .map(toPatientTag)
  }

  async addToPatient(
    clinicId: string,
    data: AddPatientTagData,
  ): Promise<PatientTag> {
    const { data: row, error } = await this.client.rpc('add_patient_tag', {
      p_clinic_id: clinicId,
      p_patient_id: data.patientId,
      p_name: data.name,
      p_color: data.color,
    })

    if (error) throw toTagError(error)
    if (!row) throw new PatientTagRepositoryError('not-found', 'tag não criada')
    return toPatientTag(row)
  }

  async removeFromPatient(
    clinicId: string,
    patientId: string,
    tagId: string,
  ): Promise<void> {
    const { error } = await this.client
      .from('patient_tag_links')
      .delete()
      .eq('clinic_id', clinicId)
      .eq('patient_id', patientId)
      .eq('tag_id', tagId)

    if (error) throw toTagError(error)
  }
}

function toPatientTag(row: PatientTagRow): PatientTag {
  return { id: row.id, name: row.name, color: row.color }
}

function toTagError(error: PatientTagQueryError): PatientTagRepositoryError {
  const code = error.code ?? undefined
  const message = error.message?.toLowerCase() ?? ''

  if (code === '42P01' || code === 'PGRST202' || code === 'PGRST205') {
    return new PatientTagRepositoryError('schema-not-ready', 'patient_tag_links ausente', code)
  }
  if (code === '42501') {
    return new PatientTagRepositoryError('forbidden', 'recusado pela policy', code)
  }
  if (code === '23505') {
    return new PatientTagRepositoryError('conflict', 'tag já vinculada', code)
  }
  if (code === 'P0002' || code === 'PGRST116') {
    return new PatientTagRepositoryError('not-found', 'tag indisponível', code)
  }
  if (code === 'PGRST301' || code === 'PGRST000' || message.includes('fetch')) {
    return new PatientTagRepositoryError('unavailable', 'serviço indisponível', code)
  }

  return new PatientTagRepositoryError('unexpected', 'falha ao acessar tags', code)
}
