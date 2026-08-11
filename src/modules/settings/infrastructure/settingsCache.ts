import 'server-only'

import { createSupabaseServerClient } from '@/lib/supabase/server'

import { DEFAULT_APPOINTMENT_DEFAULTS } from '../domain/settingsDefaults'
import { storedAppointmentDefaultsSchema } from '../schemas/settings.schema'

/**
 * A primeira — e por ora única — leitura cacheada do produto. Dívida **D3**.
 *
 * # Por que `use cache: private`, e não `use cache`
 *
 * Não é preferência. `'use cache'` **não pode ler cookies nem headers** (doc de
 * `use-cache.md`, §"Good to know"), e toda leitura deste produto passa pelo
 * cliente Supabase com a sessão do usuário — que é construído a partir do
 * cookie. Sobrariam três caminhos, e os três estão fechados:
 *
 *  1. Capturar o cliente do escopo externo: variáveis capturadas viram parte da
 *     chave de cache, e um `SupabaseClient` não é serializável.
 *  2. Criar o cliente dentro do escopo: precisa de `cookies()`, proibido ali.
 *  3. Usar o cliente `admin` (service role): **ignora RLS**. Um erro de chave
 *     não vazaria uma clínica, vazaria todas — é o P4 do roadmap na sua forma
 *     mais cara, e a regra 5 do lint existe para impedir exatamente isso.
 *
 * `'use cache: private'` aceita cookies e **nunca guarda no servidor**: o
 * resultado vive na memória do navegador de quem pediu, e não atravessa
 * sessões nem inquilinos. Para dado de um tenant, é a única forma segura de
 * cache que o Next 16 oferece a esta arquitetura.
 *
 * Ver node_modules/next/dist/docs/01-app/03-api-reference/01-directives/
 * use-cache-private.md.
 *
 * # Por que ESTE dado, e nenhum outro
 *
 * Três condições, e as três precisam valer juntas:
 *
 *  - **Não é pessoal nem clínico.** É a duração padrão que o formulário de
 *    agendamento assume. Nome de paciente, evolução, valor devido e guia de
 *    convênio não entram — nem com cache privado, porque a janela de
 *    obsolescência viraria informação errada sobre uma pessoa.
 *  - **Muda raramente.** Alguém abre `/configuracoes` uma vez por mês.
 *  - **É lido sempre.** Toda renderização de `/agenda` precisa dele.
 *
 * # A janela de obsolescência, dita por inteiro
 *
 * `stale: 300` significa que, para OUTRA pessoa da clínica, uma mudança de
 * duração padrão pode levar até cinco minutos para aparecer. Quem alterou vê na
 * hora: a action chama `updateTag` na mesma tag. É uma sugestão de formulário —
 * nada é recusado nem gravado errado por causa disso.
 */
export async function getCachedDefaultDuration(
  clinicId: string,
): Promise<number> {
  /*
   * A tag carrega `clinic_id` (P4) e vem de `clinicId`, que é ARGUMENTO — ou
   * seja, também faz parte da chave do cache. Não há como uma entrada de uma
   * clínica ser servida a outra: a chave difere antes de a tag importar.
   */
  /*
   * 300s é o mínimo para o conteúdo entrar no App Shell da rota; abaixo de 30s
   * o prefetch expiraria antes do clique. Ver cacheLife.md §"Prerendering
   * behavior".
   */
  const client = await createSupabaseServerClient()
  if (!client) return DEFAULT_APPOINTMENT_DEFAULTS.durationMinutes

  const { data, error } = await client
    .from('clinic_settings')
    .select('appointment_defaults')
    .eq('clinic_id', clinicId)
    .maybeSingle()

  if (error) {
    console.error('[settings] duracao padrao indisponivel', {
      code: error.code ?? null,
    })
    return DEFAULT_APPOINTMENT_DEFAULTS.durationMinutes
  }

  const parsed = storedAppointmentDefaultsSchema.safeParse(
    data?.appointment_defaults,
  )

  return parsed.success
    ? parsed.data.durationMinutes
    : DEFAULT_APPOINTMENT_DEFAULTS.durationMinutes
}
