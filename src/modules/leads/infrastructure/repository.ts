import 'server-only'

import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'

import { resolveDataSource } from '@/lib/data-source'
import type { Database } from '@/lib/supabase/database.types'

import type { LeadRepository } from '../domain/LeadRepository'
import { MockLeadRepository } from './MockLeadRepository'
import { SupabaseLeadRepository } from './SupabaseLeadRepository'

let demoRepository: MockLeadRepository | null = null

export async function getLeadRepository(): Promise<{
  repository: LeadRepository
  clinicId: string
  isLive: boolean
}> {
  const source = await resolveDataSource()

  if (source.mode === 'supabase') {
    return {
      repository: new SupabaseLeadRepository(source.client),
      clinicId: source.clinicId,
      isLive: true,
    }
  }

  if (source.mode === 'needs-onboarding') redirect('/onboarding')
  if (source.mode === 'session-invalid') redirect('/onboarding')

  demoRepository ??= new MockLeadRepository()
  return {
    repository: demoRepository,
    clinicId: source.clinicId,
    isLive: false,
  }
}

export function leadRepositoryFor(
  client: SupabaseClient<Database>,
): LeadRepository {
  return new SupabaseLeadRepository(client)
}
