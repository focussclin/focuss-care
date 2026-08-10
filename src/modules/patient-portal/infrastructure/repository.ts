import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/database.types'

import type { PatientPortalRepository } from '../domain/PatientPortalRepository'
import { SupabasePatientPortalRepository } from './SupabasePatientPortalRepository'

/**
 * Composição do portal do paciente.
 *
 * # Por que NÃO usa `resolveDataSource()`
 *
 * `resolveDataSource()` responde "qual clínica" e manda para `/onboarding` quem
 * não tem vínculo. Isso é exatamente o que **todo paciente** é: uma sessão
 * autenticada sem `memberships`. Passar por ali levaria cada paciente do portal
 * para a tela de criar uma clínica.
 *
 * O recorte aqui é outro e vive no banco: `portal_patient_ids()` deriva de
 * `auth.uid()`. Por isso basta o cliente com a sessão.
 *
 * # Sem repositório de demonstração
 *
 * Os outros módulos têm `Mock*` para o modo sem Supabase. Aqui não, e é
 * deliberado: um portal de paciente falso mostraria consultas e cobranças
 * inventadas para alguém que só pode concluir que são dele. As telas tratam
 * `null` como "portal indisponível neste ambiente" e dizem isso.
 */
export async function getPatientPortalRepository(): Promise<PatientPortalRepository | null> {
  const client = await createSupabaseServerClient()
  if (!client) return null

  return new SupabasePatientPortalRepository(client)
}

/** Composição para ESCRITA — o cliente já vem do `createAction`, com sessão. */
export function patientPortalRepositoryFor(
  client: SupabaseClient<Database>,
): PatientPortalRepository {
  return new SupabasePatientPortalRepository(client)
}
