import 'server-only'

import { redirect } from 'next/navigation'

import type { SupabaseClient } from '@supabase/supabase-js'

import { resolveDataSource } from '@/lib/data-source'
import type { Database } from '@/lib/supabase/database.types'

import type { TeamRepository } from '../domain/TeamRepository'
import { MockTeamRepository } from './MockTeamRepository'
import { SupabaseTeamRepository } from './SupabaseTeamRepository'

export async function getTeamRepository(): Promise<{
  repository: TeamRepository
  clinicId: string
  isLive: boolean
}> {
  const source = await resolveDataSource()

  if (source.mode === 'supabase') {
    return {
      repository: new SupabaseTeamRepository(source.client),
      clinicId: source.clinicId,
      isLive: true,
    }
  }

  if (source.mode === 'needs-onboarding') redirect('/onboarding')
  if (source.mode === 'session-invalid') redirect('/onboarding')

  return {
    repository: new MockTeamRepository(),
    clinicId: source.clinicId,
    isLive: false,
  }
}

/** Composicao para escrita — o cliente ja vem do `createAction`, com sessao. */
export function teamRepositoryFor(
  client: SupabaseClient<Database>,
): TeamRepository {
  return new SupabaseTeamRepository(client)
}
