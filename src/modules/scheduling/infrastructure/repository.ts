import 'server-only'

import { redirect } from 'next/navigation'

import type { SupabaseClient } from '@supabase/supabase-js'

import { resolveDataSource } from '@/lib/data-source'
import type { Database } from '@/lib/supabase/database.types'

import type { AppointmentRepository } from '../domain/AppointmentRepository'
import { MockAppointmentRepository } from './MockAppointmentRepository'
import { SupabaseAppointmentRepository } from './SupabaseAppointmentRepository'

export async function getAppointmentRepository(today: Date): Promise<{
  repository: AppointmentRepository
  clinicId: string
  isLive: boolean
}> {
  const source = await resolveDataSource()

  if (source.mode === 'supabase') {
    return {
      repository: new SupabaseAppointmentRepository(source.client),
      clinicId: source.clinicId,
      isLive: true,
    }
  }

  // Mesma regra do repositorio de pacientes: sem clinica, sem dado ficticio.
  if (source.mode === 'needs-onboarding') redirect('/onboarding')
  if (source.mode === 'session-invalid') redirect('/onboarding')

  return {
    repository: new MockAppointmentRepository(today),
    clinicId: source.clinicId,
    isLive: false,
  }
}

/**
 * Composicao para escrita.
 *
 * A action nao chama `getAppointmentRepository()`: ela ja recebeu do
 * `createAction` um cliente COM A SESSAO DO USUARIO e a clinica ativa resolvida
 * pelo banco. Resolver a fonte de dados de novo ali seria repetir a pergunta — e
 * abriria a porta para a escrita cair no repositorio de demonstracao, que nao
 * persiste.
 *
 * Mantido aqui, e nao dentro da action, para que a escolha do adapter continue
 * sendo decisao de infrastructure: a camada de aplicacao so ve a porta.
 */
export function appointmentRepositoryFor(
  client: SupabaseClient<Database>,
): AppointmentRepository {
  return new SupabaseAppointmentRepository(client)
}
