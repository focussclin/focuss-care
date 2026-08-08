import 'server-only'

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import type { Database } from './database.types'
import {
  isSupabaseConfigured,
  supabasePublishableKey,
  supabaseUrl,
} from './config'

/**
 * Cliente do lado do servidor, autenticado como o USUARIO da requisicao.
 *
 * E este o cliente usado por 95% do sistema: como ele carrega o JWT do usuario,
 * toda consulta passa pelas policies de RLS. Ou seja, o isolamento entre clinicas
 * continua valendo mesmo que a aplicacao esqueca de filtrar por clinic_id.
 *
 * Retorna null quando o Supabase ainda nao esta configurado — os repositorios
 * caem para os dados de demonstracao nesse caso.
 */
export async function createSupabaseServerClient() {
  if (!isSupabaseConfigured()) return null

  const cookieStore = await cookies()

  return createServerClient<Database>(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Server Components nao podem escrever cookies. A renovacao da sessao
          // acontece no cliente Supabase do navegador, entao ignorar aqui e seguro.
        }
      },
    },
  })
}
