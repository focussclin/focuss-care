import 'server-only'

import { redirect } from 'next/navigation'

import { resolveDataSource } from '@/lib/data-source'
import { getPatients, professionals } from '@/lib/mocks/clinic-data'

import type { SubscriptionRepository } from '../domain/SubscriptionRepository'
import { MockSubscriptionRepository } from './MockSubscriptionRepository'
import { SupabaseSubscriptionRepository } from './SupabaseSubscriptionRepository'

/**
 * Composicao do modulo: escolhe o adapter conforme o ambiente.
 *
 * Quem chama recebe apenas a porta — nao sabe qual dos dois esta ativo.
 */
export async function getSubscriptionRepository(today: Date): Promise<{
  repository: SubscriptionRepository
  clinicId: string
  isLive: boolean
}> {
  const source = await resolveDataSource()

  if (source.mode === 'supabase') {
    return {
      repository: new SupabaseSubscriptionRepository(source.client),
      clinicId: source.clinicId,
      isLive: true,
    }
  }

  if (source.mode === 'needs-onboarding') redirect('/onboarding')
  if (source.mode === 'session-invalid') redirect('/onboarding')

  return {
    repository: new MockSubscriptionRepository({
      professionals: professionals.length,
      patients: getPatients(today).length,
    }),
    clinicId: source.clinicId,
    isLive: false,
  }
}
