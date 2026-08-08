import 'server-only'

import { redirect } from 'next/navigation'

import type { SupabaseClient } from '@supabase/supabase-js'

import { resolveDataSource } from '@/lib/data-source'
import type { Database } from '@/lib/supabase/database.types'

import type { PatientConsentRepository } from '../domain/PatientConsentRepository'
import type { PatientContactRepository } from '../domain/PatientContactRepository'
import type { PatientRepository } from '../domain/PatientRepository'
import { MockPatientRepository } from './MockPatientRepository'
import { SupabasePatientConsentRepository } from './SupabasePatientConsentRepository'
import { SupabasePatientContactRepository } from './SupabasePatientContactRepository'
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

// ---------------------------------------------------------------------------
// Consentimentos LGPD (P-03)
// ---------------------------------------------------------------------------

/**
 * Composicao de LEITURA dos consentimentos.
 *
 * Nao ha adapter de demonstracao, e a ausencia e a decisao: um consentimento
 * ficticio e a unica coisa pior que consentimento nenhum. No modo demo esta
 * funcao devolve `isLive: false` e **nenhum** repositorio, e o painel se anuncia
 * como demonstracao em vez de exibir estados inventados (R11 do roadmap).
 *
 * O redirecionamento para `/onboarding` repete o de `getPatientRepository` pelo
 * mesmo motivo: usuario autenticado sem clinica nunca pode cair no caminho de
 * demonstracao — ele veria uma clinica que nao e dele (D8/R7).
 */
export async function getPatientConsentSource(): Promise<
  | { repository: PatientConsentRepository; clinicId: string; isLive: true }
  | { repository: null; clinicId: null; isLive: false }
> {
  const source = await resolveDataSource()

  if (source.mode === 'supabase') {
    return {
      repository: new SupabasePatientConsentRepository(source.client),
      clinicId: source.clinicId,
      isLive: true,
    }
  }

  if (source.mode === 'needs-onboarding') redirect('/onboarding')
  if (source.mode === 'session-invalid') redirect('/onboarding')

  return { repository: null, clinicId: null, isLive: false }
}

/**
 * Composicao de ESCRITA.
 *
 * Mesma razao de `patientRepositoryFor`: a action ja recebeu do `createAction` um
 * cliente COM A SESSAO DO USUARIO e a clinica resolvida pelo banco. Resolver a
 * fonte de dados de novo ali abriria a porta para a escrita cair em um caminho de
 * demonstracao — que, em consentimento, seria registrar uma escolha do paciente
 * que nunca chegou ao banco.
 */
export function patientConsentRepositoryFor(
  client: SupabaseClient<Database>,
): PatientConsentRepository {
  return new SupabasePatientConsentRepository(client)
}

/** Leitura de contatos: sem adapter demo para não apresentar dados pessoais falsos. */
export async function getPatientContactSource(): Promise<
  | { repository: PatientContactRepository; clinicId: string; isLive: true }
  | { repository: null; clinicId: null; isLive: false }
> {
  const source = await resolveDataSource()

  if (source.mode === 'supabase') {
    return {
      repository: new SupabasePatientContactRepository(source.client),
      clinicId: source.clinicId,
      isLive: true,
    }
  }

  if (source.mode === 'needs-onboarding') redirect('/onboarding')
  if (source.mode === 'session-invalid') redirect('/onboarding')

  return { repository: null, clinicId: null, isLive: false }
}

export function patientContactRepositoryFor(
  client: SupabaseClient<Database>,
): PatientContactRepository {
  return new SupabasePatientContactRepository(client)
}
