import type { AuditLogPage, AuditLogQuery } from './AuditLog'

export interface AuditLogRepository {
  list(clinicId: string, query: AuditLogQuery): Promise<AuditLogPage>
}
