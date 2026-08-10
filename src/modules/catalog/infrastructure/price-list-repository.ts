import 'server-only'

import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'

import { resolveDataSource } from '@/lib/data-source'
import type { Database } from '@/lib/supabase/database.types'

import type { PriceList } from '../domain/PriceList'
import { PriceListError, type PriceListRepository } from '../domain/PriceListRepository'
import { SupabasePriceListRepository } from './SupabasePriceListRepository'

/** Demonstracao vazia: uma tabela de preco ficticia seria confundida com a real. */
class EmptyPriceListRepository implements PriceListRepository {
  async list(): Promise<PriceList[]> {
    return []
  }

  async create(): Promise<PriceList> {
    throw readOnly()
  }

  async update(): Promise<PriceList> {
    throw readOnly()
  }

  async setActive(): Promise<PriceList> {
    throw readOnly()
  }

  async setDefault(): Promise<PriceList> {
    throw readOnly()
  }

  async setItemPrice(): Promise<PriceList> {
    throw readOnly()
  }

  async removeItem(): Promise<PriceList> {
    throw readOnly()
  }
}

function readOnly(): PriceListError {
  return new PriceListError('unavailable', 'demo repository is read-only')
}

export async function getPriceListSource(): Promise<{
  repository: PriceListRepository
  clinicId: string
  isLive: boolean
}> {
  const source = await resolveDataSource()

  if (source.mode === 'supabase') {
    return {
      repository: new SupabasePriceListRepository(source.client),
      clinicId: source.clinicId,
      isLive: true,
    }
  }

  if (source.mode === 'needs-onboarding') redirect('/onboarding')
  if (source.mode === 'session-invalid') redirect('/onboarding')

  return {
    repository: new EmptyPriceListRepository(),
    clinicId: source.clinicId,
    isLive: false,
  }
}

export function priceListRepositoryFor(
  client: SupabaseClient<Database>,
): PriceListRepository {
  return new SupabasePriceListRepository(client)
}
