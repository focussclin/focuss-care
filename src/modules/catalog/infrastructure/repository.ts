import 'server-only'

import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'

import { resolveDataSource } from '@/lib/data-source'
import type { Database } from '@/lib/supabase/database.types'

import type { Service } from '../domain/Service'
import {
  ServiceRepositoryError,
  type ServiceRepository,
} from '../domain/ServiceRepository'
import { SupabaseServiceRepository } from './SupabaseServiceRepository'

/**
 * Demonstração começa com catálogo vazio, e recusa escrita.
 *
 * Um serviço fictício com preço inventado é pior que catálogo nenhum: quem
 * visse "Consulta — R$ 250,00" concluiria que a clínica já tem tabela
 * cadastrada.
 */
class EmptyServiceRepository implements ServiceRepository {
  async list(): Promise<Service[]> {
    return []
  }

  async create(): Promise<Service> {
    throw readOnly()
  }

  async update(): Promise<Service> {
    throw readOnly()
  }

  async setActive(): Promise<Service> {
    throw readOnly()
  }

  async softDelete(): Promise<void> {
    throw readOnly()
  }
}

function readOnly(): ServiceRepositoryError {
  return new ServiceRepositoryError('unavailable', 'demo repository is read-only')
}

export async function getServiceRepository(): Promise<{
  repository: ServiceRepository
  clinicId: string
  isLive: boolean
}> {
  const source = await resolveDataSource()

  if (source.mode === 'supabase') {
    return {
      repository: new SupabaseServiceRepository(source.client),
      clinicId: source.clinicId,
      isLive: true,
    }
  }

  if (source.mode === 'needs-onboarding') redirect('/onboarding')
  if (source.mode === 'session-invalid') redirect('/onboarding')

  return {
    repository: new EmptyServiceRepository(),
    clinicId: source.clinicId,
    isLive: false,
  }
}

export function serviceRepositoryFor(
  client: SupabaseClient<Database>,
): ServiceRepository {
  return new SupabaseServiceRepository(client)
}
