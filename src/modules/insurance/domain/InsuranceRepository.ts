import type {
  Authorization,
  AuthorizationAnswer,
  InsurancePlan,
  InsuranceProvider,
  InsuranceSummary,
  NewAuthorizationData,
  NewPlanData,
  NewProviderData,
  PatientInsuranceOption,
  PatientInsurance,
  NewPatientInsuranceData,
  ClaimDenial,
  ClaimDenialUpdate,
  ClaimInvoiceOption,
  NewClaimDenialData,
} from './Insurance'

/**
 * PORTA dos convênios — feature **V-01**.
 *
 * A tabela de glosas é separada de autorizações: uma guia negada impede o
 * atendimento; uma glosa acontece depois da fatura e vira prejuízo ou recurso.
 *
 * **Não há verificação de elegibilidade.** Consultar se a carteirinha está
 * válida JUNTO À OPERADORA exige integração externa (TISS/portal), que este
 * ambiente não tem. O que existe é `patient_insurances.valid_until`, uma data
 * que a clínica digitou — fato local, e a tela o chama pelo nome: "validade
 * cadastrada", nunca "elegível".
 *
 * **Não há `delete`.** Operadora e plano se desativam (`is_active = false`);
 * guia se cancela. Apagar operadora deixaria faturas apontando para o nada.
 */
export interface InsuranceRepository {
  listProviders(clinicId: string): Promise<InsuranceProvider[]>

  listPlans(clinicId: string): Promise<InsurancePlan[]>

  /** Guias mais recentes primeiro. */
  listAuthorizations(clinicId: string, limit: number): Promise<Authorization[]>

  /** Carteirinhas ativas, para abrir uma guia. */
  listPatientInsurances(clinicId: string): Promise<PatientInsuranceOption[]>

  listPatientInsuranceRecords(clinicId: string): Promise<PatientInsurance[]>

  createPatientInsurance(
    clinicId: string,
    data: NewPatientInsuranceData,
  ): Promise<PatientInsurance>

  setPatientInsuranceActive(
    clinicId: string,
    insuranceId: string,
    isActive: boolean,
  ): Promise<PatientInsurance>

  summary(clinicId: string): Promise<InsuranceSummary>

  createProvider(
    clinicId: string,
    data: NewProviderData,
  ): Promise<InsuranceProvider>

  /**
   * Ativa ou desativa a operadora.
   *
   * Desativar não apaga e não mexe nos planos: eles continuam existindo e
   * apontando para ela. Uma operadora inativa é uma com quem a clínica parou de
   * trabalhar, e as faturas antigas continuam fazendo sentido.
   */
  setProviderActive(
    clinicId: string,
    providerId: string,
    isActive: boolean,
  ): Promise<InsuranceProvider>

  createPlan(clinicId: string, data: NewPlanData): Promise<InsurancePlan>

  /**
   * Abre a guia, em `requested`.
   *
   * Nasce sem número de autorização: o número **vem da operadora**, e inventá-lo
   * aqui produziria uma guia que o faturamento rejeita — depois do atendimento
   * já ter sido feito.
   */
  createAuthorization(
    clinicId: string,
    data: NewAuthorizationData,
    createdBy: string,
  ): Promise<Authorization>

  /**
   * Registra a resposta da operadora.
   *
   * Só guia em `requested` aceita resposta: reescrever uma já respondida
   * apagaria o motivo da negativa — que é justamente o que se usa para recorrer.
   */
  answerAuthorization(
    clinicId: string,
    authorizationId: string,
    answer: AuthorizationAnswer,
  ): Promise<Authorization>

  listClaimDenials(clinicId: string, limit: number): Promise<ClaimDenial[]>

  /** Faturas de convênio não canceladas, para registrar uma glosa. */
  listClaimInvoiceOptions(
    clinicId: string,
    limit: number,
  ): Promise<ClaimInvoiceOption[]>

  createClaimDenial(
    clinicId: string,
    data: NewClaimDenialData,
    createdBy: string,
  ): Promise<ClaimDenial>

  updateClaimDenial(
    clinicId: string,
    denialId: string,
    update: ClaimDenialUpdate,
  ): Promise<ClaimDenial>
}
