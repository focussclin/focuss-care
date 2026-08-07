import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { getActiveClinicId } from '@/lib/auth/active-clinic'
import type { Database } from '@/lib/supabase/database.types'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/** Clinica ficticia usada apenas no modo de demonstracao. */
export const DEMO_CLINIC_ID = 'demo-clinic'

export type DataSource =
  | { mode: 'supabase'; client: SupabaseClient<Database>; clinicId: string }
  | { mode: 'demo'; clinicId: typeof DEMO_CLINIC_ID }

/**
 * Decide, uma unica vez por request, se os repositorios falam com o banco ou com os
 * dados de demonstracao.
 *
 * Cai para 'demo' em dois casos:
 *  - Supabase nao configurado (sem URL/chave no ambiente);
 *  - usuario autenticado sem vinculo de clinica (ainda nao passou pelo bootstrap).
 *
 * Concentrar a decisao aqui evita que cada tela precise repetir a verificacao —
 * e garante que dashboard, agenda e pacientes nunca fiquem em modos diferentes.
 */
export async function resolveDataSource(): Promise<DataSource> {
  const client = await createSupabaseServerClient()

  if (!client) {
    return { mode: 'demo', clinicId: DEMO_CLINIC_ID }
  }

  const clinicId = await getActiveClinicId()

  if (!clinicId) {
    return { mode: 'demo', clinicId: DEMO_CLINIC_ID }
  }

  return { mode: 'supabase', client, clinicId }
}
