import type { AuditLogEntry } from '../domain/AuditLog'
import type { MembershipRole } from '@/lib/supabase/database.types'

export interface AuditLogDto {
  id: number
  action: string
  entityType: string
  entityId: string | null
  actorRole: MembershipRole | null
  occurredAt: string
}

export function toAuditLogDto(entry: AuditLogEntry): AuditLogDto {
  return {
    id: entry.id,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    actorRole: entry.actorRole,
    occurredAt: entry.occurredAt.toISOString(),
  }
}
