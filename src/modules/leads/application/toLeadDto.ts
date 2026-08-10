import { formatShortDate } from '@/lib/utils/date'

import type { Lead } from '../domain/Lead'
import type { LeadDto } from '../schemas/lead.schema'

export function toLeadDto(lead: Lead): LeadDto {
  return {
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    source: lead.source,
    campaign: lead.campaign,
    interest: lead.interest,
    stage: lead.stage,
    potentialValueCents: lead.potentialValueCents,
    nextActionAt: lead.nextActionAt?.toISOString() ?? null,
    notes: lead.notes,
    assignedTo: lead.assignedTo,
    convertedPatientId: lead.convertedPatientId,
    createdAt: lead.createdAt.toISOString(),
    updatedAt: lead.updatedAt.toISOString(),
  }
}

export function formatLeadValue(cents: number | null): string | null {
  if (cents === null) return null
  return (cents / 100).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

export function formatLeadDate(iso: string | null): string | null {
  return iso ? formatShortDate(new Date(iso)) : null
}
