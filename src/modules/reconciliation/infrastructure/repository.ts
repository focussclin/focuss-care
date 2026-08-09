import 'server-only'

import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'

import { resolveDataSource } from '@/lib/data-source'
import type { Database } from '@/lib/supabase/database.types'

import type { ReconciliationRepository } from '../domain/ReconciliationRepository'
import { MockReconciliationRepository } from './MockReconciliationRepository'
import { SupabaseReconciliationRepository } from './SupabaseReconciliationRepository'

let demoRepository: MockReconciliationRepository | null = null

export async function getReconciliationRepository(): Promise<{
  repository: ReconciliationRepository
  clinicId: string
  isLive: boolean
}> {
  const source = await resolveDataSource()
  if (source.mode === 'supabase') return { repository: new SupabaseReconciliationRepository(source.client), clinicId: source.clinicId, isLive: true }
  if (source.mode === 'needs-onboarding') redirect('/onboarding')
  if (source.mode === 'session-invalid') redirect('/onboarding')
  demoRepository ??= new MockReconciliationRepository()
  return { repository: demoRepository, clinicId: source.clinicId, isLive: false }
}

export function reconciliationRepositoryFor(client: SupabaseClient<Database>): ReconciliationRepository {
  return new SupabaseReconciliationRepository(client)
}
