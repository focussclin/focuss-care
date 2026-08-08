import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import type { Profile, ProfileInput } from '../domain/Profile'
import type { ProfileRepository } from '../domain/ProfileRepository'
import { ProfileRepositoryError } from '../domain/ProfileRepositoryError'

type Client = SupabaseClient<Database>

const PROFILE_SELECT = 'id, full_name, email, phone'

/**
 * Adapter do perfil pessoal.
 *
 * # A única checagem que importa aqui
 *
 * Toda operação filtra `.eq('id', userId)`, e `userId` chega por parâmetro,
 * saído do `ActionContext`. Não há filtro de clínica — e a ausência é correta:
 * um perfil não pertence a uma clínica, pertence à pessoa. Quem se protege
 * disso é a RLS de `profiles`, que restringe a linha a `auth.uid()`.
 *
 * **Nenhuma coluna fora de `full_name` e `phone` é escrita.** `email`,
 * `avatar_url` e `active_clinic_id` existem na tabela e não aparecem em nenhum
 * `update` deste arquivo — os motivos estão na porta.
 */
export class SupabaseProfileRepository implements ProfileRepository {
  constructor(private readonly client: Client) {}

  async findById(userId: string): Promise<Profile | null> {
    const { data, error } = await this.client
      .from('profiles')
      .select(PROFILE_SELECT)
      .eq('id', userId)
      .maybeSingle()

    if (error) throw toWriteError(error)
    if (!data) return null

    return toProfile(data)
  }

  async update(userId: string, input: ProfileInput): Promise<Profile> {
    const { data, error } = await this.client
      .from('profiles')
      .update({
        full_name: input.fullName,
        phone: input.phone,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
      .select(PROFILE_SELECT)
      .maybeSingle()

    if (error) throw toWriteError(error)

    /*
     * Zero linhas aqui é a linha ausente, não a linha de outra pessoa.
     *
     * A RLS restringe `profiles` a `auth.uid()`, então "atualizou nada" só pode
     * significar que o perfil deste usuário não existe — o gatilho de criação no
     * cadastro não rodou. Devolver 'not-found' leva a tela a dizer isso, em vez
     * de "sem permissão", que mandaria a pessoa procurar quem a autorize.
     */
    if (!data) {
      throw new ProfileRepositoryError(
        'not-found',
        `perfil ${userId} inexistente`,
      )
    }

    return toProfile(data)
  }
}

function toProfile(row: {
  id: string
  full_name: string
  email: string
  phone: string | null
}): Profile {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
  }
}

/**
 * Traduz a recusa do Postgres.
 *
 * Só `reason` e `code` sobem para o log: a mensagem pode ecoar o valor enviado,
 * e aqui ele é o nome e o telefone de uma pessoa.
 */
function toWriteError(error: {
  code?: string | null
  message?: string | null
}): ProfileRepositoryError {
  const code = error.code ?? undefined
  const message = error.message ?? 'sem mensagem'

  if (code === '42501' || code === 'PGRST301') {
    return new ProfileRepositoryError('forbidden', message, code)
  }

  if (!code && /fetch|network|timeout|econnre/i.test(message)) {
    return new ProfileRepositoryError('unavailable', message)
  }

  return new ProfileRepositoryError('unexpected', message, code)
}
