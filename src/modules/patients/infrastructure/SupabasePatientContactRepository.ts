import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, PatientContactRow } from '@/lib/supabase/database.types'

import type {
  PatientContact,
  PatientContactData,
  PatientContactRepository,
} from '../domain/PatientContactRepository'
import { PatientRepositoryError } from '../domain/PatientRepositoryError'
import { readFailure, toPatientWriteError } from './postgrestFailure'

type Client = SupabaseClient<Database>

const CONTACT_COLUMNS =
  'id, patient_id, name, relationship, phone, email, is_legal_guardian, created_at, updated_at'

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Adapter tenant-scoped. O cliente recebido sempre carrega a sessao atual. */
export class SupabasePatientContactRepository
  implements PatientContactRepository
{
  constructor(private readonly client: Client) {}

  async listByPatient(
    clinicId: string,
    patientId: string,
  ): Promise<PatientContact[]> {
    assertUuid(patientId)

    const { data, error } = await this.client
      .from('patient_contacts')
      .select(CONTACT_COLUMNS)
      .eq('clinic_id', clinicId)
      .eq('patient_id', patientId)
      .order('is_legal_guardian', { ascending: false })
      .order('name', { ascending: true })

    if (error) {
      throw readFailure(
        'patient_contacts.listByPatient',
        error,
        'Falha ao carregar os contatos do paciente.',
      )
    }

    return ((data ?? []) as PatientContactRow[]).map(toPatientContact)
  }

  async create(
    clinicId: string,
    patientId: string,
    data: PatientContactData,
  ): Promise<PatientContact> {
    assertUuid(patientId)
    const now = new Date().toISOString()

    const { data: row, error } = await this.client
      .from('patient_contacts')
      .insert({
        clinic_id: clinicId,
        patient_id: patientId,
        name: data.name,
        relationship: data.relationship,
        phone: data.phone,
        email: data.email,
        is_legal_guardian: data.isLegalGuardian,
        updated_at: now,
      })
      .select(CONTACT_COLUMNS)
      .single()

    if (error) throw toPatientWriteError(error)
    if (!row) throw unexpected('insert nao devolveu linha')

    return toPatientContact(row as PatientContactRow)
  }

  async update(
    clinicId: string,
    patientId: string,
    contactId: string,
    data: PatientContactData,
  ): Promise<PatientContact> {
    assertUuid(patientId)
    assertUuid(contactId)

    const { data: row, error } = await this.client
      .from('patient_contacts')
      .update({
        name: data.name,
        relationship: data.relationship,
        phone: data.phone,
        email: data.email,
        is_legal_guardian: data.isLegalGuardian,
        updated_at: new Date().toISOString(),
      })
      .eq('clinic_id', clinicId)
      .eq('patient_id', patientId)
      .eq('id', contactId)
      .select(CONTACT_COLUMNS)
      .maybeSingle()

    if (error) throw toPatientWriteError(error)
    if (!row) throw new PatientRepositoryError('not-found', 'contato nao encontrado')

    return toPatientContact(row as PatientContactRow)
  }
}

function assertUuid(value: string): void {
  if (UUID.test(value)) return
  throw new PatientRepositoryError('not-found', 'identificador fora do formato uuid')
}

function unexpected(message: string): PatientRepositoryError {
  return new PatientRepositoryError('unexpected', message)
}

function toPatientContact(row: PatientContactRow): PatientContact {
  return {
    id: row.id,
    patientId: row.patient_id,
    name: row.name,
    relationship: row.relationship,
    phone: row.phone,
    email: row.email,
    isLegalGuardian: row.is_legal_guardian,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}
