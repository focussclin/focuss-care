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

  /**
   * Converte o lead em PACIENTE, e devolve o id da ficha criada.
   *
   * # Por que é uma operação só
   *
   * Converter faz três escritas que precisam valer juntas: cria a linha em
   * `patients`, marca o lead apontando para ela, e registra o evento de etapa.
   * Em três idas ao banco, uma falha no meio deixa **um paciente órfão** — uma
   * pessoa no cadastro clínico que ninguém pediu, sem lead que a explique.
   *
   * Isso não é inconsistência técnica: é uma ficha de paciente a mais, num
   * produto de saúde, que alguém encontra depois sem saber de onde veio. Por
   * isso o adapter chama uma função do banco, e não três consultas.
   *
   * # Não é `setStage(… 'converted')`
   *
   * Mover para "convertido" pela coluna deixaria o funil dizendo que virou
   * paciente sem que paciente nenhum existisse — o `convertedPatientId` ficaria
   * nulo, e a etapa mentiria. Só este método cria a ficha.
   */
  convert(clinicId: string, leadId: string): Promise<{ patientId: string }>
}
