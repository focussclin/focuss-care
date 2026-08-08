import 'server-only'

import { redirect } from 'next/navigation'

import type { SupabaseClient } from '@supabase/supabase-js'

import { resolveDataSource } from '@/lib/data-source'
import type { Database } from '@/lib/supabase/database.types'

import type { InsuranceRepository } from '../domain/InsuranceRepository'
import { MockInsuranceRepository } from './MockInsuranceRepository'
import { SupabaseInsuranceRepository } from './SupabaseInsuranceRepository'

export async function getInsuranceRepository(): Promise<{
  repository: InsuranceRepository
  clinicId: string
  isLive: boolean
}> {
  const source = await resolveDataSource()

  if (source.mode === 'supabase') {
    return {
      repository: new SupabaseInsuranceRepository(source.client),
      clinicId: source.clinicId,
      isLive: true,
    }
  }

  if (source.mode === 'needs-onboarding') redirect('/onboarding')
  if (source.mode === 'session-invalid') redirect('/onboarding')

  return {
    repository: new MockInsuranceRepository(),
    clinicId: source.clinicId,
    isLive: false,
  }
}

/** Composicao para escrita — o cliente ja vem do `createAction`, com sessao. */
export function insuranceRepositoryFor(
  client: SupabaseClient<Database>,
): InsuranceRepository {
  return new SupabaseInsuranceRepository(client)
}
