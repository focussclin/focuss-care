import 'server-only'

import { createClient } from '@supabase/supabase-js'

import type { Database } from './database.types'
import { supabaseUrl } from './config'

/**
 * ⚠️ CLIENTE ADMINISTRATIVO — IGNORA RLS.
 *
 * A service role key contorna TODAS as policies. Vazada no bundle do cliente, ela
 * expoe os dados de todas as clinicas de uma vez — o pior cenario de falha deste
 * produto.
 *
 * Protecoes em vigor:
 *  - `import 'server-only'` no topo: qualquer import a partir de um Client
 *    Component quebra o build, em vez de vazar em producao.
 *  - A variavel NAO tem prefixo NEXT_PUBLIC_, entao o Next nunca a inlineia no
 *    bundle do browser.
 *
 * Uso legitimo: onboarding, jobs agendados e webhooks — nunca o fluxo de request
 * de um usuario. Para requests, use createSupabaseServerClient().
 */
export function createSupabaseAdminClient() {
  const serviceRoleKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

  if (supabaseUrl.length === 0 || serviceRoleKey.length === 0) {
    throw new Error(
      'Cliente administrativo indisponivel: defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SECRET_KEY.',
    )
  }

  return createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
