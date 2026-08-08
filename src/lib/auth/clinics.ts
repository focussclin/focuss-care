import 'server-only'

import { cache } from 'react'

import type { MembershipRole } from '@/lib/supabase/database.types'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Clínicas de que o usuário participa — a lista que alimenta a troca (I-03).
 *
 * # Por que isso existe, se cada assinatura tem uma clínica só
 *
 * São duas cardinalidades diferentes, e confundi-las custa caro:
 *
 *  - **Assinatura → clínica é 1:1.** `subscriptions.clinic_id`. Uma conta é
 *    responsável por uma clínica, e o `createClinicAction` recusa a segunda.
 *  - **Usuário → clínica é N:N.** `memberships`. O profissional que atende em
 *    dois consultórios é convidado para ambos, e cada um tem a própria
 *    assinatura, paga por outro dono.
 *
 * Sem a segunda, o convite (I-04) não teria sentido: aceitar levaria a pessoa
 * para uma clínica sem caminho de volta para a dela.
 */

export interface UserClinic {
  id: string
  /** `clinics.trade_name` — o nome que a recepção reconhece. */
  name: string
  role: MembershipRole
}

/**
 * `cache()` por render pass: a casca pergunta uma vez e o seletor reaproveita,
 * sem segunda ida ao banco no mesmo request.
 *
 * Só vínculos `active`: convite pendente ainda não é clínica, e vínculo
 * revogado não pode reaparecer num seletor.
 *
 * A RLS já limita `memberships` ao próprio usuário; o `eq('user_id', …)`
 * explícito é defesa em profundidade e mantém a consulta alinhada ao índice.
 */
export const listUserClinics = cache(async function listUserClinics(): Promise<
  UserClinic[]
> {
  const supabase = await createSupabaseServerClient()
  if (!supabase) return []

  const { data: userData } = await supabase.auth.getUser()
  const userId = userData?.user?.id
  if (!userId) return []

  const { data, error } = await supabase
    .from('memberships')
    .select('role, clinic_id, clinics(id, trade_name)')
    .eq('user_id', userId)
    .eq('status', 'active')

  if (error) {
    // Falha aqui não pode derrubar a casca: sem a lista, o seletor simplesmente
    // não aparece e o usuário continua na clínica ativa.
    console.error('[auth] listUserClinics', {
      code: error.code ?? null,
      message: error.message ?? null,
    })
    return []
  }

  return (data ?? [])
    .flatMap((row) => {
      const clinic = row.clinics
      if (!clinic) return []

      return [{ id: clinic.id, name: clinic.trade_name, role: row.role }]
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
})
