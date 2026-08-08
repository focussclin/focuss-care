import 'server-only'

import { redirect } from 'next/navigation'

import type { SupabaseClient } from '@supabase/supabase-js'

import { resolveDataSource } from '@/lib/data-source'
import type { Database } from '@/lib/supabase/database.types'

import type { MedicalRecordRepository } from '../domain/MedicalRecordRepository'
import { MockMedicalRecordRepository } from './MockMedicalRecordRepository'
import { SupabaseMedicalRecordRepository } from './SupabaseMedicalRecordRepository'

export async function getMedicalRecordRepository(today: Date): Promise<{
  repository: MedicalRecordRepository
  clinicId: string
  isLive: boolean
}> {
  const source = await resolveDataSource()

  if (source.mode === 'supabase') {
    return {
      repository: new SupabaseMedicalRecordRepository(source.client),
      clinicId: source.clinicId,
      isLive: true,
    }
  }

  if (source.mode === 'needs-onboarding') redirect('/onboarding')
  if (source.mode === 'session-invalid') redirect('/onboarding')

  return {
    repository: new MockMedicalRecordRepository(today),
    clinicId: source.clinicId,
    isLive: false,
  }
}

/** Composicao para escrita — o cliente ja vem do `createAction`, com sessao. */
export function medicalRecordRepositoryFor(
  client: SupabaseClient<Database>,
): MedicalRecordRepository {
  return new SupabaseMedicalRecordRepository(client)
}
