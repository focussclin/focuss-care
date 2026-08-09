import type { Lead, LeadStage, LeadUpdateData, NewLeadData } from './Lead'

export interface LeadRepository {
  list(clinicId: string): Promise<Lead[]>
  create(clinicId: string, createdBy: string, data: NewLeadData): Promise<Lead>
  update(
    clinicId: string,
    leadId: string,
    changedBy: string,
    data: LeadUpdateData,
  ): Promise<Lead>
  setStage(
    clinicId: string,
    leadId: string,
    changedBy: string,
    stage: LeadStage,
  ): Promise<Lead>
}
