import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { getSessionState } from '@/lib/auth/session'
import type { Database } from '@/lib/supabase/database.types'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/** Clinica ficticia usada apenas no modo de demonstracao. */
export const DEMO_CLINIC_ID = 'demo-clinic'

export type DataSource =
  | { mode: 'supabase'; client: SupabaseClient<Database>; clinicId: string }
  /** Autenticado sem clinica, ou sem sessao: nao ha dado a mostrar. */
  | { mode: 'needs-onboarding' }
  /** Ha vinculo, mas o JWT nao carrega as claims necessarias para RLS. */
  | { mode: 'session-invalid' }
  | { mode: 'demo'; clinicId: typeof DEMO_CLINIC_ID }

/**
 * Decide, uma unica vez por request, se os repositorios falam com o banco ou com
 * os dados de demonstracao.
 *
 * A distincao entre 'demo' e 'needs-onboarding' e deliberada e e uma regra de
 * seguranca, nao de conveniencia (roadmap D8/R7):
 *
 *  - 'demo' existe SOMENTE quando o Supabase nao esta configurado no ambiente.
 *    E a vitrine local, sem banco por tras.
 *  - 'needs-onboarding' e um usuario autenticado sem vinculo de clinica. Ele
 *    nunca pode ver dado ficticio: a clinica fake pareceria a clinica dele, e um
 *    bug de tenancy real ficaria indistinguivel de uma tela de demonstracao.
 *
 * Concentrar a decisao aqui evita que cada tela repita a verificacao — e garante
 * que dashboard, agenda e pacientes nunca fiquem em modos diferentes.
 */
export async function resolveDataSource(): Promise<DataSource> {
  const session = await getSessionState()

  if (session.status === 'not-configured') {
    return { mode: 'demo', clinicId: DEMO_CLINIC_ID }
  }

  if (session.status === 'claims-stale') {
    return { mode: 'session-invalid' }
  }

  if (session.status !== 'active') {
    return { mode: 'needs-onboarding' }
  }

  const client = await createSupabaseServerClient()
  if (!client) return { mode: 'needs-onboarding' }

  return { mode: 'supabase', client, clinicId: session.clinicId }
}
