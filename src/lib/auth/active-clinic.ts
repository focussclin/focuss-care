import 'server-only'

import { cache } from 'react'

import { createSupabaseServerClient } from '@/lib/supabase/server'

/*
 * As tres leituras abaixo sao `cache()` da React — deduplicadas por REQUEST, e
 * nunca entre requests.
 *
 * Cada uma e uma ida ao Postgres, e as tres respondem a mesma pergunta durante
 * todo o render: qual clinica, qual profissional, qual papel. Sem a
 * deduplicacao, uma rota que checa permissao e depois compoe dois modulos que
 * tambem checam paga tres roundtrips para receber tres vezes a mesma resposta —
 * e o custo aparecia justamente ao adicionar portao, que e o contrario do
 * incentivo que se quer.
 *
 * `cache()` e a mesma ferramenta que `getSessionState` ja usa, pelo mesmo
 * motivo. O escopo por request e o que a torna segura aqui: papel trocado no
 * meio de um render nao existe, e a proxima navegacao le de novo.
 */

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
export const getActiveClinicId = cache(async function getActiveClinicId(): Promise<
  string | null
> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return null

  const { data, error } = await supabase.rpc('current_clinic_id')

  if (error || !data) return null

  return data
})

/**
 * `professionals.id` do usuario na clinica ativa, ou null.
 *
 * E OUTRA coisa que o id de usuario: `professionals` e o cadastro de quem
 * atende, com conselho, registro e especialidade. Recepcao e financeiro tem
 * usuario e nao tem linha ali — e por isso nao assinam prontuario.
 *
 * Sai da RPC do proprio banco, e nao de uma consulta montada aqui, pela mesma
 * razao de `current_clinic_id()`: e a funcao que as policies consultam, entao
 * aplicacao e banco nunca discordam sobre quem e o profissional da sessao.
 */
export const getCurrentProfessionalId = cache(
  async function getCurrentProfessionalId(): Promise<string | null> {
    const supabase = await createSupabaseServerClient()
    if (!supabase) return null

    const { data, error } = await supabase.rpc('current_professional_id')

    if (error || !data) return null

    return data
  },
)

/** Papel do usuario na clinica ativa, para decisoes de autorizacao na UI. */
export const getActiveClinicRole = cache(async function getActiveClinicRole() {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return null

  const { data, error } = await supabase.rpc('current_clinic_role')

  if (error || !data) return null

  return data
})
