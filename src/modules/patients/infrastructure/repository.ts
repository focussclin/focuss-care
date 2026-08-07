import 'server-only'

import { resolveDataSource } from '@/lib/data-source'

import type { PatientRepository } from '../domain/PatientRepository'
import { MockPatientRepository } from './MockPatientRepository'
import { SupabasePatientRepository } from './SupabasePatientRepository'

/**
 * Composicao do modulo: escolhe o adapter conforme o ambiente.
 * Quem chama recebe apenas a porta — nao sabe (nem precisa saber) qual dos dois esta ativo.
 */
export async function getPatientRepository(today: Date): Promise<{
  repository: PatientRepository
  clinicId: string
  isLive: boolean
}> {
  const source = await resolveDataSource()

  if (source.mode === 'supabase') {
    return {
      repository: new SupabasePatientRepository(source.client),
      clinicId: source.clinicId,
      isLive: true,
    }
  }

  return {
    repository: new MockPatientRepository(today),
    clinicId: source.clinicId,
    isLive: false,
  }
}
