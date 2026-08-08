import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Clinica ativa da sessao.
 *
 * A fonte de verdade e a funcao `current_clinic_id()` do proprio banco — a mesma
 * que as policies de RLS consultam. Usar a RPC em vez de reimplementar a leitura
 * das claims garante que aplicacao e banco nunca discordem sobre qual clinica esta
 * ativa; se discordassem, a aplicacao mostraria uma tela vazia (ou, pior, tentaria
 * gravar em uma clinica que a RLS recusa).
 *
 * Retorna null quando o Supabase nao esta configurado, quando nao ha sessao, ou
 * quando o usuario ainda nao tem vinculo ativo.
 */
export async function getActiveClinicId(): Promise<string | null> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return null

  const { data, error } = await supabase.rpc('current_clinic_id')

  if (error || !data) return null

  return data
}

/** Papel do usuario na clinica ativa, para decisoes de autorizacao na UI. */
export async function getActiveClinicRole() {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return null

  const { data, error } = await supabase.rpc('current_clinic_role')

  if (error || !data) return null

  return data
}
