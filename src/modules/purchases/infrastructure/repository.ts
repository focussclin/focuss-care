import 'server-only'

import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'

import { resolveDataSource } from '@/lib/data-source'
import type { Database } from '@/lib/supabase/database.types'

import type { PurchaseRepository } from '../domain/PurchaseRepository'
import { MockPurchaseRepository } from './MockPurchaseRepository'
import { SupabasePurchaseRepository } from './SupabasePurchaseRepository'

let demoRepository: MockPurchaseRepository | null = null

export async function getPurchaseRepository(): Promise<{
  repository: PurchaseRepository
  clinicId: string
  isLive: boolean
}> {
  const source = await resolveDataSource()

  if (source.mode === 'supabase') {
    return {
      repository: new SupabasePurchaseRepository(source.client),
      clinicId: source.clinicId,
      isLive: true,
    }
  }

  if (source.mode === 'needs-onboarding') redirect('/onboarding')
  if (source.mode === 'session-invalid') redirect('/onboarding')

  demoRepository ??= new MockPurchaseRepository()
  return { repository: demoRepository, clinicId: source.clinicId, isLive: false }
}

export function purchaseRepositoryFor(
  client: SupabaseClient<Database>,
): PurchaseRepository {
  return new SupabasePurchaseRepository(client)
}
