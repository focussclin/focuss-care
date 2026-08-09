import type { LeadDto, LeadFormValues } from '../schemas/lead.schema'

export interface LeadsScreenProps {
  leads: readonly LeadDto[]
  assignees: readonly { id: string; name: string }[]
  onSubmit: (
    values: LeadFormValues,
    leadId: string | null,
  ) => Promise<string | null>
  onMove: (leadId: string, stage: LeadFormValues['stage']) => Promise<string | null>
  isLive: boolean
  schemaPending?: boolean
}
