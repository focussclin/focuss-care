import 'server-only'

import { redirect } from 'next/navigation'

import type { SupabaseClient } from '@supabase/supabase-js'

import { resolveDataSource } from '@/lib/data-source'
import type { Database } from '@/lib/supabase/database.types'

import type { ClinicSettingsRepository } from '../domain/ClinicSettingsRepository'
import { MockClinicSettingsRepository } from './MockClinicSettingsRepository'
import { SupabaseClinicSettingsRepository } from './SupabaseClinicSettingsRepository'

export async function getClinicSettingsRepository(): Promise<{
  repository: ClinicSettingsRepository
  clinicId: string
  isLive: boolean
}> {
  const source = await resolveDataSource()

  if (source.mode === 'supabase') {
    return {
      repository: new SupabaseClinicSettingsRepository(source.client),
      clinicId: source.clinicId,
      isLive: true,
    }
  }

  if (source.mode === 'needs-onboarding') redirect('/onboarding')
  if (source.mode === 'session-invalid') redirect('/onboarding')

  return {
    repository: new MockClinicSettingsRepository(),
    clinicId: source.clinicId,
    isLive: false,
  }
}

/** Composicao para escrita — o cliente ja vem do `createAction`, com sessao. */
export function clinicSettingsRepositoryFor(
  client: SupabaseClient<Database>,
): ClinicSettingsRepository {
  return new SupabaseClinicSettingsRepository(client)
}
