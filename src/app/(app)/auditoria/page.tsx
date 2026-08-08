import type { Metadata } from 'next'
import { forbidden } from 'next/navigation'
import { connection } from 'next/server'

import { getActiveClinicRole } from '@/lib/auth/active-clinic'
import { can } from '@/lib/auth/permissions'
import { toAuditLogDto } from '@/modules/audit/application/toAuditLogDto'
import { getAuditLogRepository } from '@/modules/audit/infrastructure/repository'
import { AuditoriaScreen } from '@/modules/audit/ui/AuditoriaScreen'
import { auditLogQuerySchema } from '@/modules/audit/schemas/auditLog.schema'

export const metadata: Metadata = {
  title: 'Auditoria',
  description: 'Trilha de ações relevantes da clínica.',
}

const PAGE_SIZE = 50

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<{
    action?: string
    action_custom?: string
    entityType?: string
    page?: string
  }>
}) {
  await connection()

  const role = await getActiveClinicRole()
  if (!can(role, 'audit.read')) forbidden()

  const params = await searchParams
  const parsed = auditLogQuerySchema.parse({
    action: params.action_custom || params.action,
    entityType: params.entityType,
    page: params.page,
  })
  const source = await getAuditLogRepository()
  const page = await source.repository.list(source.clinicId, {
    action: parsed.action,
    entityType: parsed.entityType,
    limit: PAGE_SIZE,
    offset: (parsed.page - 1) * PAGE_SIZE,
  })

  return (
    <AuditoriaScreen
      entries={page.items.map(toAuditLogDto)}
      hasMore={page.hasMore}
      page={parsed.page}
      action={parsed.action}
      entityType={parsed.entityType}
      isLive={source.isLive}
    />
  )
}
