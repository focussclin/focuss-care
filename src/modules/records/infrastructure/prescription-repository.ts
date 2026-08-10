import 'server-only'

import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'

import { resolveDataSource } from '@/lib/data-source'
import type { Database } from '@/lib/supabase/database.types'

import type { Prescription } from '../domain/Prescription'
import {
  PrescriptionRepositoryError,
  type PrescriptionRepository,
} from '../domain/PrescriptionRepository'
import { SupabasePrescriptionRepository } from './SupabasePrescriptionRepository'

/**
 * Demonstração começa vazia, e recusa escrita.
 *
 * Uma prescrição fictícia é a invenção mais perigosa deste produto: quem
 * abrisse a ficha leria um medicamento que ninguém prescreveu.
 */
class EmptyPrescriptionRepository implements PrescriptionRepository {
  async listByPatient(): Promise<Prescription[]> {
    return []
  }

  async patientBelongsTo(): Promise<boolean> {
    return false
  }

  async encounterBelongsTo(): Promise<boolean> {
    return false
  }

  async create(): Promise<Prescription> {
    throw new PrescriptionRepositoryError('unavailable', 'demo repository is read-only')
  }
}

export async function getPrescriptionSource(): Promise<{
  repository: PrescriptionRepository
  clinicId: string
  isLive: boolean
}> {
  const source = await resolveDataSource()

  if (source.mode === 'supabase') {
    return {
      repository: new SupabasePrescriptionRepository(source.client),
      clinicId: source.clinicId,
      isLive: true,
    }
  }

  if (source.mode === 'needs-onboarding') redirect('/onboarding')
  if (source.mode === 'session-invalid') redirect('/onboarding')

  return {
    repository: new EmptyPrescriptionRepository(),
    clinicId: source.clinicId,
    isLive: false,
  }
}

export function prescriptionRepositoryFor(
  client: SupabaseClient<Database>,
): PrescriptionRepository {
  return new SupabasePrescriptionRepository(client)
}
