import 'server-only'

import { redirect } from 'next/navigation'

import type { SupabaseClient } from '@supabase/supabase-js'

import { resolveDataSource } from '@/lib/data-source'
import type { Database } from '@/lib/supabase/database.types'

import type { EncounterRepository } from '../domain/EncounterRepository'
import { MockEncounterRepository } from './MockEncounterRepository'
import { SupabaseEncounterRepository } from './SupabaseEncounterRepository'

/**
 * Composicao do modulo: escolhe o adapter conforme o ambiente.
 * Quem chama recebe apenas a porta.
 */
export async function getEncounterRepository(today: Date): Promise<{
  repository: EncounterRepository
  clinicId: string
  isLive: boolean
}> {
  const source = await resolveDataSource()

  if (source.mode === 'supabase') {
    return {
      repository: new SupabaseEncounterRepository(source.client),
      clinicId: source.clinicId,
      isLive: true,
    }
  }

  // Mesma regra dos outros modulos: sem clinica, sem dado ficticio.
  if (source.mode === 'needs-onboarding') redirect('/onboarding')
  if (source.mode === 'session-invalid') redirect('/onboarding')

  return {
    repository: new MockEncounterRepository(today),
    clinicId: source.clinicId,
    isLive: false,
  }
}

/**
 * Composicao para escrita.
 *
 * A action ja recebeu do `createAction` um cliente COM A SESSAO DO USUARIO e a
 * clinica ativa resolvida pelo banco. Resolver a fonte de dados de novo ali
 * abriria a porta para a escrita cair no repositorio de demonstracao.
 */
export function encounterRepositoryFor(
  client: SupabaseClient<Database>,
): EncounterRepository {
  return new SupabaseEncounterRepository(client)
}
