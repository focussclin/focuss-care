import 'server-only'

import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'

import { resolveDataSource } from '@/lib/data-source'
import type { Database } from '@/lib/supabase/database.types'

import type { AvailabilityException } from '../domain/AvailabilityException'
import {
  AvailabilityExceptionError,
  type AvailabilityExceptionRepository,
} from '../domain/AvailabilityExceptionRepository'
import { SupabaseAvailabilityExceptionRepository } from './SupabaseAvailabilityExceptionRepository'

/**
 * Demonstração começa sem exceção nenhuma, e recusa escrita.
 *
 * Um feriado fictício aqui apareceria como agenda fechada num dia em que ela
 * não está — e quem visse a tela concluiria que o produto bloqueou sozinho.
 */
class EmptyAvailabilityExceptionRepository implements AvailabilityExceptionRepository {
  async listUpcoming(): Promise<AvailabilityException[]> {
    return []
  }

  async countAppointmentsIn(): Promise<number> {
    return 0
  }

  async create(): Promise<AvailabilityException> {
    throw readOnly()
  }

  async remove(): Promise<void> {
    throw readOnly()
  }
}

function readOnly(): AvailabilityExceptionError {
  return new AvailabilityExceptionError('unavailable', 'demo repository is read-only')
}

export async function getAvailabilityExceptionSource(): Promise<{
  repository: AvailabilityExceptionRepository
  clinicId: string
  isLive: boolean
}> {
  const source = await resolveDataSource()

  if (source.mode === 'supabase') {
    return {
      repository: new SupabaseAvailabilityExceptionRepository(source.client),
      clinicId: source.clinicId,
      isLive: true,
    }
  }

  if (source.mode === 'needs-onboarding') redirect('/onboarding')
  if (source.mode === 'session-invalid') redirect('/onboarding')

  return {
    repository: new EmptyAvailabilityExceptionRepository(),
    clinicId: source.clinicId,
    isLive: false,
  }
}

export function availabilityExceptionRepositoryFor(
  client: SupabaseClient<Database>,
): AvailabilityExceptionRepository {
  return new SupabaseAvailabilityExceptionRepository(client)
}
