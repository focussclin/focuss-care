import 'server-only'

import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'

import { resolveDataSource } from '@/lib/data-source'
import type { Database } from '@/lib/supabase/database.types'

import type { AuditLogRepository } from '../domain/AuditLogRepository'
import { MockAuditLogRepository } from './MockAuditLogRepository'
import { SupabaseAuditLogRepository } from './SupabaseAuditLogRepository'

export async function getAuditLogRepository(): Promise<{
  repository: AuditLogRepository
  clinicId: string
  isLive: boolean
}> {
  const source = await resolveDataSource()

  if (source.mode === 'supabase') {
    return {
      repository: new SupabaseAuditLogRepository(source.client),
      clinicId: source.clinicId,
      isLive: true,
    }
  }

  if (source.mode === 'needs-onboarding') redirect('/onboarding')
  if (source.mode === 'session-invalid') redirect('/onboarding')

  return {
    repository: new MockAuditLogRepository(),
    clinicId: source.clinicId,
    isLive: false,
  }
}

export function auditLogRepositoryFor(
  client: SupabaseClient<Database>,
): AuditLogRepository {
  return new SupabaseAuditLogRepository(client)
}
