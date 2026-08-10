import type { AuditLogPage } from '../domain/AuditLog'
import type { AuditLogRepository } from '../domain/AuditLogRepository'

/** Sem banco, a tela de auditoria permanece vazia em vez de inventar eventos. */
export class MockAuditLogRepository implements AuditLogRepository {
  async list(): Promise<AuditLogPage> {
    return { items: [], hasMore: false }
  }
}
