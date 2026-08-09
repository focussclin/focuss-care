import 'server-only'

import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'

import { resolveDataSource } from '@/lib/data-source'
import type { Database } from '@/lib/supabase/database.types'

import type { InboxRepository } from '../domain/InboxRepository'
import { MockInboxRepository } from './MockInboxRepository'
import { SupabaseInboxRepository } from './SupabaseInboxRepository'

let demoRepository: MockInboxRepository | null = null

export async function getInboxRepository(): Promise<{
  repository: InboxRepository
  clinicId: string
  isLive: boolean
}> {
  const source = await resolveDataSource()

  if (source.mode === 'supabase') {
    return {
      repository: new SupabaseInboxRepository(source.client),
      clinicId: source.clinicId,
      isLive: true,
    }
  }

  if (source.mode === 'needs-onboarding') redirect('/onboarding')
  if (source.mode === 'session-invalid') redirect('/onboarding')

  demoRepository ??= new MockInboxRepository()
  return { repository: demoRepository, clinicId: source.clinicId, isLive: false }
}

export function inboxRepositoryFor(client: SupabaseClient<Database>): InboxRepository {
  return new SupabaseInboxRepository(client)
}
