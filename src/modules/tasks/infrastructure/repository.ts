import 'server-only'

import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'

import { resolveDataSource } from '@/lib/data-source'
import type { Database } from '@/lib/supabase/database.types'

import type { TaskRepository } from '../domain/TaskRepository'
import { MockTaskRepository } from './MockTaskRepository'
import { SupabaseTaskRepository } from './SupabaseTaskRepository'

/**
 * A demonstração precisa SOBREVIVER entre requests.
 *
 * `MockRoomRepository` é instanciado a cada chamada e por isso a demonstração
 * de salas esquece o que foi criado no request anterior. Aqui a instância é
 * única por processo: sem isso, criar uma tarefa e ver a lista vazia logo em
 * seguida pareceria bug do produto, não limite da demonstração.
 */
let demoRepository: MockTaskRepository | null = null

export async function getTaskRepository(): Promise<{
  repository: TaskRepository
  clinicId: string
  isLive: boolean
}> {
  const source = await resolveDataSource()

  if (source.mode === 'supabase') {
    return {
      repository: new SupabaseTaskRepository(source.client),
      clinicId: source.clinicId,
      isLive: true,
    }
  }

  if (source.mode === 'needs-onboarding') redirect('/onboarding')
  if (source.mode === 'session-invalid') redirect('/onboarding')

  demoRepository ??= new MockTaskRepository()

  return {
    repository: demoRepository,
    clinicId: source.clinicId,
    isLive: false,
  }
}

/** Composição para ESCRITA — o cliente já vem do `createAction`, com sessão. */
export function taskRepositoryFor(
  client: SupabaseClient<Database>,
): TaskRepository {
  return new SupabaseTaskRepository(client)
}
