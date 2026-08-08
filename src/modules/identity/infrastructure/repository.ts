import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/database.types'

import type { ProfileRepository } from '../domain/ProfileRepository'
import { SupabaseProfileRepository } from './SupabaseProfileRepository'

/**
 * Composição do perfil pessoal.
 *
 * **Não passa por `resolveDataSource`**, ao contrário dos demais módulos, e a
 * diferença é deliberada: aquele resolvedor decide entre banco e demonstração
 * pela CLÍNICA ativa, e um perfil existe antes de qualquer clínica — quem acabou
 * de se cadastrar e ainda não fez onboarding já tem nome.
 *
 * Sem Supabase configurado devolve `null`, e a tela some. Um perfil de
 * demonstração editável seria a pior espécie de mentira aqui: a pessoa
 * mudaria o próprio nome, veria o campo atualizado, e nada teria mudado.
 */
export async function getProfileRepository(): Promise<ProfileRepository | null> {
  const client = await createSupabaseServerClient()
  if (!client) return null

  return new SupabaseProfileRepository(client)
}

/** Composicao para escrita — o cliente ja vem do `createAction`, com sessao. */
export function profileRepositoryFor(
  client: SupabaseClient<Database>,
): ProfileRepository {
  return new SupabaseProfileRepository(client)
}
