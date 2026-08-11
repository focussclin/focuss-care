import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import { hasRoom, type PlanLimit, type QuotaResource } from './plan-limits'

/**
 * A cota do plano, lida do banco.
 *
 * Separado de `plan-limits.ts` de propósito: lá mora a regra, testável sem I/O;
 * aqui mora a consulta. Misturar as duas faria toda asserção sobre o limite
 * precisar de um cliente Supabase falso.
 */

/**
 * Colunas de `plans` que expressam teto, por recurso.
 *
 * Mapa explícito, e não `${resource}_max`: o nome da coluna não é derivável do
 * nome do recurso (`professionals` -> `max_professionals`), e string montada é
 * como se pede uma coluna que não existe.
 */
const LIMIT_COLUMN: Record<QuotaResource, 'max_professionals' | 'max_patients'> = {
  professionals: 'max_professionals',
  patients: 'max_patients',
}

/**
 * Quanto o plano permite e quanto já foi usado.
 *
 * # Sem assinatura é SEM TETO, e é deliberado
 *
 * `subscriptions` pode não ter linha: `SubscriptionOverview` já documenta que
 * "uma clínica criada antes de existir cobrança simplesmente não tem
 * assinatura". Tratar a ausência como limite zero trancaria toda clínica que
 * existe hoje — inclusive as de demonstração — no primeiro cadastro.
 *
 * # Falha de leitura também é sem teto
 *
 * Mesma escolha que o horário de funcionamento faz na agenda, e pelo mesmo
 * motivo declarado lá: indisponibilidade da configuração não pode virar clínica
 * que não consegue trabalhar. Um Postgres lento não deve impedir a recepção de
 * cadastrar um paciente; o sinal fica no log do servidor.
 */
export async function quotaFor(
  client: SupabaseClient<Database>,
  clinicId: string,
  resource: QuotaResource,
): Promise<PlanLimit> {
  const [max, used] = await Promise.all([
    readLimit(client, clinicId, resource),
    countUsed(client, clinicId, resource),
  ])

  return { max, used }
}

/** Atalho para o caso mais comum: cabe mais um? */
export async function hasQuotaFor(
  client: SupabaseClient<Database>,
  clinicId: string,
  resource: QuotaResource,
): Promise<{ allowed: boolean; max: number | null }> {
  const limit = await quotaFor(client, clinicId, resource)
  return { allowed: hasRoom(limit), max: limit.max }
}

async function readLimit(
  client: SupabaseClient<Database>,
  clinicId: string,
  resource: QuotaResource,
): Promise<number | null> {
  const column = LIMIT_COLUMN[resource]

  const { data, error } = await client
    .from('subscriptions')
    .select(`plans ( ${column} )`)
    /*
     * Mais de uma linha por clínica é possível (histórico de plano). A vigente é
     * a mais recente — a mesma leitura de `SupabaseSubscriptionRepository`.
     */
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error('[quota] limite do plano indisponivel', {
      resource,
      code: error.code ?? null,
    })
    return null
  }

  const plan = (data as { plans?: Record<string, number | null> | null } | null)
    ?.plans

  return plan?.[column] ?? null
}

/**
 * O uso atual, contado com `head` — sem transferir linha.
 *
 * Conta o que a cota cobra, igual a `/assinaturas`: profissional ATIVO e
 * paciente não removido. Os dois números precisam bater com a tela, senão a
 * barra diz "8 de 10" e a escrita recusa.
 */
async function countUsed(
  client: SupabaseClient<Database>,
  clinicId: string,
  resource: QuotaResource,
): Promise<number> {
  const query = client
    .from(resource)
    .select('id', { count: 'exact', head: true })
    .eq('clinic_id', clinicId)
    .is('deleted_at', null)

  const { count, error } =
    resource === 'professionals' ? await query.eq('is_active', true) : await query

  if (error) {
    console.error('[quota] uso atual indisponivel', {
      resource,
      code: error.code ?? null,
    })
    // Zero, e não "estourado": falha de leitura não inventa consumo.
    return 0
  }

  return count ?? 0
}
