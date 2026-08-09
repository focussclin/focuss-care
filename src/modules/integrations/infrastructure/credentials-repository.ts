import 'server-only'

import { redirect } from 'next/navigation'

import { resolveDataSource } from '@/lib/data-source'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

import type { IntegrationCredentialRepository } from '../domain/IntegrationCredentialRepository'
import { MockIntegrationCredentialRepository } from './MockIntegrationCredentialRepository'
import { SupabaseIntegrationCredentialRepository } from './SupabaseIntegrationCredentialRepository'

export async function getIntegrationCredentialRepository(): Promise<{
  repository: IntegrationCredentialRepository
  clinicId: string
  isLive: boolean
}> {
  const source = await resolveDataSource()

  if (source.mode === 'supabase') {
    return {
      repository: new SupabaseIntegrationCredentialRepository(source.client),
      clinicId: source.clinicId,
      isLive: true,
    }
  }

  if (source.mode === 'needs-onboarding') redirect('/onboarding')
  if (source.mode === 'session-invalid') redirect('/onboarding')

  return {
    repository: new MockIntegrationCredentialRepository(),
    clinicId: source.clinicId,
    isLive: false,
  }
}

/** Composição para Server Actions: o cliente já carrega a sessão do usuário. */
export function integrationCredentialRepositoryFor(
  client: SupabaseClient<Database>,
): IntegrationCredentialRepository {
  return new SupabaseIntegrationCredentialRepository(client)
}
