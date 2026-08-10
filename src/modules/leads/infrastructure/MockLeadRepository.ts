import type {
  Lead,
  LeadStage,
  LeadUpdateData,
  NewLeadData,
} from '../domain/Lead'
import type { LeadRepository } from '../domain/LeadRepository'
import { LeadRepositoryError } from '../domain/LeadRepositoryError'

/** Sem leads fictícios: o CRM demo começa vazio e deixa isso explícito. */
export class MockLeadRepository implements LeadRepository {
  private readonly leads: Lead[] = []
  private sequence = 0

  async list(): Promise<Lead[]> {
    return [...this.leads]
  }

  async create(
    _clinicId: string,
    _createdBy: string,
    data: NewLeadData,
  ): Promise<Lead> {
    this.sequence += 1
    const now = new Date()
    const lead: Lead = {
      id: `lead-demo-${this.sequence}`,
      name: data.name,
      phone: data.phone,
      email: data.email,
      source: data.source,
      campaign: data.campaign,
      interest: data.interest,
      stage: data.stage,
      potentialValueCents: data.potentialValueCents,
      nextActionAt: data.nextActionAt,
      notes: data.notes,
      assignedTo: null,
      convertedPatientId: null,
      createdAt: now,
      updatedAt: now,
    }
    this.leads.push(lead)
    return lead
  }

  async update(
    _clinicId: string,
    leadId: string,
    _changedBy: string,
    data: LeadUpdateData,
  ): Promise<Lead> {
    const lead = this.find(leadId)
    Object.assign(lead, {
      ...data,
      campaign: data.campaign ?? lead.campaign,
      interest: data.interest ?? lead.interest,
      notes: data.notes ?? lead.notes,
      updatedAt: new Date(),
    })
    return lead
  }

  async setStage(
    _clinicId: string,
    leadId: string,
    _changedBy: string,
    stage: LeadStage,
  ): Promise<Lead> {
    const lead = this.find(leadId)
    lead.stage = stage
    lead.updatedAt = new Date()
    return lead
  }

  async convert(
    _clinicId: string,
    _leadId: string,
  ): Promise<{ patientId: string }> {
    void _clinicId
    void _leadId

    /*
     * A demonstração NÃO converte.
     *
     * Os outros métodos deste mock escrevem na memória e a tela responde de
     * verdade — nada persiste, e isso é honesto porque nada aqui sai da aba.
     *
     * Converter é diferente: ela promete criar uma **ficha de paciente**, que é
     * registro clínico. Fingir isso faria a tela dizer "paciente criado" e o
     * cadastro seguir vazio — e quem experimentasse o fluxo concluiria que o
     * produto perde dado.
     *
     * `unavailable` é a razão certa: a operação existe e este ambiente não a
     * sustenta. A tela já traduz isso em "não foi possível agora".
     */
    throw new LeadRepositoryError(
      'unavailable',
      'a conversão em paciente exige banco: a demonstração não cria ficha clínica',
    )
  }

  private find(leadId: string): Lead {
    const lead = this.leads.find((item) => item.id === leadId)
    if (!lead) throw new LeadRepositoryError('not-found', 'lead indisponível')
    return lead
  }
}
