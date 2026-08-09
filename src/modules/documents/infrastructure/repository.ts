import 'server-only'

import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'

import { resolveDataSource } from '@/lib/data-source'
import type { Database } from '@/lib/supabase/database.types'

import type { DocumentRepository } from '../domain/DocumentRepository'
import { MockDocumentRepository } from './MockDocumentRepository'
import {
  DOCUMENT_BUCKET,
} from './documentsDatabase'
import { SupabaseDocumentRepository } from './SupabaseDocumentRepository'

let demoRepository: MockDocumentRepository | null = null

export async function getDocumentRepository(): Promise<{
  repository: DocumentRepository
  clinicId: string
  isLive: boolean
  client: SupabaseClient<Database> | null
}> {
  const source = await resolveDataSource()
  if (source.mode === 'supabase') {
    return {
      repository: new SupabaseDocumentRepository(source.client),
      clinicId: source.clinicId,
      isLive: true,
      client: source.client,
    }
  }

  if (source.mode === 'needs-onboarding') redirect('/onboarding')
  if (source.mode === 'session-invalid') redirect('/onboarding')

  demoRepository ??= new MockDocumentRepository()
  return {
    repository: demoRepository,
    clinicId: source.clinicId,
    isLive: false,
    client: null,
  }
}

export function documentRepositoryFor(
  client: SupabaseClient<Database>,
): DocumentRepository {
  return new SupabaseDocumentRepository(client)
}

/**
 * Verifica o bucket pela sessão atual, sem usar service_role.
 * Listar a pasta da clínica também valida a policy tenant-scoped do Storage.
 */
export async function isDocumentStorageReady(
  client: SupabaseClient<Database> | null,
  clinicId: string,
): Promise<boolean> {
  if (!client) return false
  const { error } = await client.storage
    .from(DOCUMENT_BUCKET)
    .list(clinicId, { limit: 1 })
  return !error
}
