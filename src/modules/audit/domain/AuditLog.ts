import type { MembershipRole } from '@/lib/supabase/database.types'

export interface AuditLogEntry {
  id: number
  action: string
  entityType: string
  entityId: string | null
  actorRole: MembershipRole | null
  occurredAt: Date
}

export interface AuditLogQuery {
  action: string | null
  entityType: string | null
  limit: number
  offset: number
}

export interface AuditLogPage {
  items: AuditLogEntry[]
  hasMore: boolean
}
