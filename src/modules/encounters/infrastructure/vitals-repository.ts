import 'server-only'

import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'

import { resolveDataSource } from '@/lib/data-source'
import type { Database } from '@/lib/supabase/database.types'

import type { VitalsEntry } from '../domain/Vitals'
import { VitalsRepositoryError, type VitalsRepository } from '../domain/VitalsRepository'
import { SupabaseVitalsRepository } from './SupabaseVitalsRepository'

/**
 * Demonstração começa sem aferição nenhuma, e recusa escrita.
 *
 * Um sinal vital fictício é a pior invenção possível deste produto: quem lesse
 * "PA 120/80" na ficha concluiria que alguém mediu.
 */
class EmptyVitalsRepository implements VitalsRepository {
  async listByPatient(): Promise<VitalsEntry[]> {
    return []
  }

  async patientBelongsTo(): Promise<boolean> {
    // Sem clínica conectada não há paciente a confirmar — e a escrita já falha.
    return false
  }

  async encounterBelongsTo(): Promise<boolean> {
    return false
  }

  async record(): Promise<VitalsEntry> {
    throw new VitalsRepositoryError('unavailable', 'demo repository is read-only')
  }
}

export async function getVitalsSource(): Promise<{
  repository: VitalsRepository
  clinicId: string
  isLive: boolean
}> {
  const source = await resolveDataSource()

  if (source.mode === 'supabase') {
    return {
      repository: new SupabaseVitalsRepository(source.client),
      clinicId: source.clinicId,
      isLive: true,
    }
  }

  if (source.mode === 'needs-onboarding') redirect('/onboarding')
  if (source.mode === 'session-invalid') redirect('/onboarding')

  return {
    repository: new EmptyVitalsRepository(),
    clinicId: source.clinicId,
    isLive: false,
  }
}

export function vitalsRepositoryFor(
  client: SupabaseClient<Database>,
): VitalsRepository {
  return new SupabaseVitalsRepository(client)
}
