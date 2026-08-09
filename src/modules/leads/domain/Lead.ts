export const LEAD_STAGES = [
  'new',
  'contacted',
  'qualified',
  'scheduled',
  'showed',
  'converted',
  'lost',
] as const

export type LeadStage = (typeof LEAD_STAGES)[number]

export interface LeadAssignee {
  id: string
  name: string
}

export interface Lead {
  id: string
  name: string
  phone: string | null
  email: string | null
  source: string
  campaign: string | null
  interest: string | null
  stage: LeadStage
  potentialValueCents: number | null
  nextActionAt: Date | null
  notes: string | null
  assignedTo: LeadAssignee | null
  convertedPatientId: string | null
  createdAt: Date
  updatedAt: Date
}

export interface NewLeadData {
  name: string
  phone: string | null
  email: string | null
  source: string
  campaign: string | null
  interest: string | null
  stage: LeadStage
  potentialValueCents: number | null
  nextActionAt: Date | null
  notes: string | null
  assignedToId: string | null
}

export type LeadUpdateData = Partial<NewLeadData>
