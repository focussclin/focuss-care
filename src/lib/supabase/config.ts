/**
 * Configuracao do Supabase.
 *
 * Os nomes das chaves seguem a nomenclatura atual do Supabase
 * (publishable / secret). Os nomes antigos (anon / service_role) sao aceitos como
 * fallback para nao quebrar ambientes que ainda nao migraram.
 *
 * Enquanto as variaveis nao existem, a aplicacao roda com os dados de demonstracao
 * (src/lib/mocks/clinic-data.ts), sem espalhar `if` pelas telas.
 */

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''

export const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  ''

/**
 * True quando ha URL e chave publica. A chave secreta nao entra na conta: ela e
 * opcional e usada apenas por jobs e webhooks.
 */
export function isSupabaseConfigured(): boolean {
  return supabaseUrl.length > 0 && supabasePublishableKey.length > 0
}
