import 'server-only'

import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'

import { resolveDataSource } from '@/lib/data-source'
import type { Database } from '@/lib/supabase/database.types'

import type { Professional } from '../domain/Professional'
import {
  ProfessionalError,
  type ProfessionalRepository,
} from '../domain/ProfessionalRepository'
import { SupabaseProfessionalRepository } from './SupabaseProfessionalRepository'

/**
 * Demonstração vazia — e vazia de propósito.
 *
 * Um "Dr. Exemplo" fabricado aqui apareceria na agenda de demonstração como
 * profissional de verdade, e é dele que sai a assinatura do prontuário. Lista
 * vazia com o aviso de modo demonstração é mais honesto que um nome inventado.
 */
class EmptyProfessionalRepository implements ProfessionalRepository {
  async list(): Promise<Professional[]> {
    return []
  }

  async create(): Promise<Professional> {
    throw readOnly()
  }

  async update(): Promise<Professional> {
    throw readOnly()
  }

  async setActive(): Promise<Professional> {
    throw readOnly()
  }

  async userBelongsToClinic(): Promise<boolean> {
    return false
  }
}

function readOnly(): ProfessionalError {
  return new ProfessionalError('unavailable', 'demo repository is read-only')
}

export async function getProfessionalSource(): Promise<{
  repository: ProfessionalRepository
  clinicId: string
  isLive: boolean
}> {
  const source = await resolveDataSource()

  if (source.mode === 'supabase') {
    return {
      repository: new SupabaseProfessionalRepository(source.client),
      clinicId: source.clinicId,
      isLive: true,
    }
  }

  if (source.mode === 'needs-onboarding') redirect('/onboarding')
  if (source.mode === 'session-invalid') redirect('/onboarding')

  return {
    repository: new EmptyProfessionalRepository(),
    clinicId: source.clinicId,
    isLive: false,
  }
}

/** Composição para escrita — o cliente já vem do `createAction`, com sessão. */
export function professionalRepositoryFor(
  client: SupabaseClient<Database>,
): ProfessionalRepository {
  return new SupabaseProfessionalRepository(client)
}
