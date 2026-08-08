import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { AuditLogRow, Database } from '@/lib/supabase/database.types'

import type { AuditLogEntry, AuditLogQuery, AuditLogPage } from '../domain/AuditLog'
import type { AuditLogRepository } from '../domain/AuditLogRepository'

type Client = SupabaseClient<Database>

/** Metadados brutos, IP e user-agent ficam fora da tela de auditoria. */
const COLUMNS = 'id, action, entity_type, entity_id, actor_role, occurred_at'

export class SupabaseAuditLogRepository implements AuditLogRepository {
  constructor(private readonly client: Client) {}

  async list(clinicId: string, query: AuditLogQuery): Promise<AuditLogPage> {
    const safeLimit = Math.min(Math.max(Math.trunc(query.limit) || 1, 1), 100)
    const safeOffset = Math.max(Math.trunc(query.offset) || 0, 0)

    let builder = this.client
      .from('audit_log')
      .select(COLUMNS)
      .eq('clinic_id', clinicId)

    if (query.action) builder = builder.eq('action', query.action)
    if (query.entityType) builder = builder.eq('entity_type', query.entityType)

    const { data, error } = await builder
      .order('occurred_at', { ascending: false })
      .order('id', { ascending: false })
      .range(safeOffset, safeOffset + safeLimit)

    if (error) {
      console.error('[audit] list', { code: error.code ?? null })
      throw new Error('Falha ao carregar a auditoria.')
    }

    const rows = ((data ?? []) as AuditLogRow[])
    return {
      items: rows.slice(0, safeLimit).map(toAuditLogEntry),
      hasMore: rows.length > safeLimit,
    }
  }
}

function toAuditLogEntry(row: AuditLogRow): AuditLogEntry {
  return {
    id: row.id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    actorRole: row.actor_role,
    occurredAt: new Date(row.occurred_at),
  }
}
