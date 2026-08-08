import 'server-only'

import { redirect } from 'next/navigation'

import type { SupabaseClient } from '@supabase/supabase-js'

import { resolveDataSource } from '@/lib/data-source'
import type { Database } from '@/lib/supabase/database.types'

import type { BillingRepository } from '../domain/BillingRepository'
import { MockBillingRepository } from './MockBillingRepository'
import { SupabaseBillingRepository } from './SupabaseBillingRepository'

export async function getBillingRepository(): Promise<{
  repository: BillingRepository
  clinicId: string
  isLive: boolean
}> {
  const source = await resolveDataSource()

  if (source.mode === 'supabase') {
    return {
      repository: new SupabaseBillingRepository(source.client),
      clinicId: source.clinicId,
      isLive: true,
    }
  }

  if (source.mode === 'needs-onboarding') redirect('/onboarding')
  if (source.mode === 'session-invalid') redirect('/onboarding')

  return {
    repository: new MockBillingRepository(),
    clinicId: source.clinicId,
    isLive: false,
  }
}

/** Composicao para escrita — o cliente ja vem do `createAction`, com sessao. */
export function billingRepositoryFor(
  client: SupabaseClient<Database>,
): BillingRepository {
  return new SupabaseBillingRepository(client)
}
