import 'server-only'

import { redirect } from 'next/navigation'

import type { SupabaseClient } from '@supabase/supabase-js'

import { resolveDataSource } from '@/lib/data-source'
import type { Database } from '@/lib/supabase/database.types'

import type { PatientRepository } from '../domain/PatientRepository'
import { MockPatientRepository } from './MockPatientRepository'
import { SupabasePatientRepository } from './SupabasePatientRepository'

/**
 * Composicao do modulo: escolhe o adapter conforme o ambiente.
 * Quem chama recebe apenas a porta — nao sabe (nem precisa saber) qual dos dois esta ativo.
 */
export async function getPatientRepository(today: Date): Promise<{
  repository: PatientRepository
  clinicId: string
  isLive: boolean
}> {
  const source = await resolveDataSource()

  if (source.mode === 'supabase') {
    return {
      repository: new SupabasePatientRepository(source.client),
      clinicId: source.clinicId,
      isLive: true,
    }
  }

  // Usuario autenticado sem clinica nunca recebe o repositorio de demonstracao:
  // ele veria dados de uma clinica que nao e dele. Defesa em profundidade — a
  // casca de (app) ja barra antes, mas a regra vale mesmo se alguem montar este
  // repositorio fora dela.
  if (source.mode === 'needs-onboarding') redirect('/onboarding')
  if (source.mode === 'session-invalid') redirect('/onboarding')

  return {
    repository: new MockPatientRepository(today),
    clinicId: source.clinicId,
    isLive: false,
  }
}

/**
 * Composicao para escrita.
 *
 * A action nao chama `getPatientRepository()`: ela ja recebeu do `createAction` um
 * cliente COM A SESSAO DO USUARIO e a clinica ativa resolvida pelo banco. Resolver
 * a fonte de dados de novo ali seria repetir a pergunta — e abriria a porta para a
 * escrita cair no repositorio de demonstracao, que nao persiste.
 *
 * Mantido aqui, e nao dentro da action, para que a escolha do adapter continue
 * sendo decisao de infrastructure: a camada de aplicacao so ve a porta.
 */
export function patientRepositoryFor(
  client: SupabaseClient<Database>,
): PatientRepository {
  return new SupabasePatientRepository(client)
}
