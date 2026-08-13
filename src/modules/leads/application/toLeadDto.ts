import { formatShortDate } from '@/lib/utils/date'
import { formatCents } from '@/lib/utils/money'

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

/**
 * Valor do lead em texto — pelo MESMO formatador do resto do produto.
 *
 * Isto era um `Intl.NumberFormat` próprio, idêntico ao de `lib/utils/money`. Dois
 * formatadores de dinheiro não divergem hoje; divergem no dia em que um dos dois
 * mudar — e aí a mesma quantia aparece de dois jeitos em telas vizinhas, que é o
 * tipo de detalhe que faz alguém desconfiar do número.
 */
export function formatLeadValue(cents: number | null): string | null {
  return cents === null ? null : formatCents(cents)
}

export function formatLeadDate(iso: string | null): string | null {
  return iso ? formatShortDate(new Date(iso)) : null
}
