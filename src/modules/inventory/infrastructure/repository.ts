import 'server-only'

import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'

import { resolveDataSource } from '@/lib/data-source'
import type { Database } from '@/lib/supabase/database.types'

import type { InventoryRepository } from '../domain/InventoryRepository'
import { MockInventoryRepository } from './MockInventoryRepository'
import { SupabaseInventoryRepository } from './SupabaseInventoryRepository'

export async function getInventoryRepository(): Promise<{
  repository: InventoryRepository
  clinicId: string
  isLive: boolean
}> {
  const source = await resolveDataSource()

  if (source.mode === 'supabase') {
    return {
      repository: new SupabaseInventoryRepository(source.client),
      clinicId: source.clinicId,
      isLive: true,
    }
  }

  if (source.mode === 'needs-onboarding') redirect('/onboarding')
  if (source.mode === 'session-invalid') redirect('/onboarding')

  return {
    repository: new MockInventoryRepository(),
    clinicId: source.clinicId,
    isLive: false,
  }
}

export function inventoryRepositoryFor(
  client: SupabaseClient<Database>,
): InventoryRepository {
  return new SupabaseInventoryRepository(client)
}
