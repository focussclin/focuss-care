import type {
  AuthorizationStatus,
  ClaimDenialStatus,
} from '@/lib/supabase/database.types'

/**
 * Convênios — feature **V-01**.
 *
 * # Quatro entidades, e confundi-las é o erro caro
 *
 *  - **`insurance_providers`** — a OPERADORA (Unimed, Bradesco Saúde). Uma
 *    empresa com quem a clínica tem contrato.
 *  - **`insurance_plans`** — o PLANO daquela operadora (Enfermaria, Apartamento,
 *    Ouro). É onde moram a coparticipação e o prazo de pagamento, porque é o
 *    plano que os define, não a operadora.
 *  - **`patient_insurances`** — a CARTEIRINHA de um paciente num plano. É o que
 *    liga a pessoa ao convênio, e tem validade própria.
 *  - **`insurance_authorizations`** — a GUIA: o pedido de autorização de um
 *    procedimento, com a resposta da operadora.
 *
 * Glosas vivem em entidade própria porque são recusa de pagamento depois da
 * fatura enviada, não negativa de autorização prévia.
 */

export interface InsuranceProvider {
  id: string
  name: string
  /** Registro na ANS. Nulo quando a clínica não o cadastrou. */
  ansCode: string | null
  cnpj: string | null
  isActive: boolean
  notes: string | null
  /** Quantos planos ativos esta operadora tem nesta clínica. */
  activePlans: number
}

export interface InsurancePlan {
  id: string
  providerId: string
  providerName: string
  name: string
  planCode: string | null
  /** Coparticipação em centavos — o que o paciente paga no balcão. */
  copayCents: number
  /** Prazo contratual de pagamento da operadora, em dias. */
  paymentTermDays: number
  isActive: boolean
}

/** Um procedimento pedido na guia. */
export interface AuthorizationProcedure {
  /** Código TUSS, quando a clínica o usa. */
  code: string
  description: string
  quantity: number
}

export interface Authorization {
  id: string
  patientId: string
  patientName: string
  planName: string
  providerName: string
  /** Número devolvido pela operadora ao aprovar. Nulo enquanto não respondeu. */
  authorizationNumber: string | null
  status: AuthorizationStatus
  procedures: readonly AuthorizationProcedure[]
  requestedAt: Date
  answeredAt: Date | null
  expiresAt: Date | null
  /** Preenchido quando a operadora negou. Texto dela, não da clínica. */
  denialReason: string | null
}

/**
 * A guia vista pela BUSCA GLOBAL.
 *
 * Não é `Authorization`, e a diferença é a razão de este tipo existir: a guia
 * carrega os **procedimentos pedidos** (código TUSS e descrição) e o **motivo da
 * negativa** escrito pela operadora. Os dois são informação clínica — dizem o
 * que se pretendia fazer com aquela pessoa e por quê —, e a paleta é um campo de
 * texto aberto em cima do cabeçalho de toda tela autenticada.
 *
 * O recorte não é feito na hora de montar o DTO: o adapter **não seleciona**
 * essas colunas. O que não sai do banco não vaza de lugar nenhum.
 */
export interface AuthorizationSearchHit {
  id: string
  patientName: string
  /** Número da operadora. Nulo enquanto a guia não foi respondida. */
  authorizationNumber: string | null
  status: AuthorizationStatus
  providerName: string
  requestedAt: Date
}

export interface NewProviderData {
  name: string
  ansCode: string | null
  cnpj: string | null
  notes: string | null
}

export interface NewPlanData {
  providerId: string
  name: string
  planCode: string | null
  copayCents: number
  paymentTermDays: number
}

export interface NewAuthorizationData {
  /** A carteirinha, e não o paciente: é ela que diz por qual plano se pede. */
  patientInsuranceId: string
  procedures: readonly AuthorizationProcedure[]
  notes: string | null
}

/** A resposta da operadora a uma guia. Aprovar e negar exigem coisas diferentes. */
export type AuthorizationAnswer =
  | {
      outcome: 'approved'
      authorizationNumber: string
      /** Guia aprovada tem prazo. Sem ele, ninguém sabe até quando vale. */
      expiresAt: Date | null
    }
  | {
      outcome: 'denied'
      /** O motivo da operadora, transcrito. É o que se contesta depois. */
      denialReason: string
    }

/**
 * O ciclo da guia depois da resposta da operadora.
 *
 * # O que faltava
 *
 * O módulo alcançava três das seis situações do enum: `requested`, `approved` e
 * `denied`. Uma guia aprovada não tinha para onde ir — a lista de aprovadas
 * crescia para sempre, sem distinguir a que já foi usada da que ainda vale, e
 * sem forma de desistir de um pedido que o paciente não voltou para fazer.
 *
 * As duas transições abaixo são da CLÍNICA, e não da operadora: responder
 * (aprovar/negar) continua sendo `AuthorizationAnswer`, que exige número ou
 * motivo. Baixar e cancelar são decisões de quem administra a guia.
 *
 * # `expired` não é escrito por esta aplicação
 *
 * Vencimento é `expires_at` passando — comparação de data, não decisão de
 * ninguém. Gravar o status exigiria um processo que rodasse todo dia e o
 * virasse; sem esse processo, uma guia gravada como `expired` conviveria com
 * outra vencida e ainda marcada `approved`, e a lista mentiria de duas formas.
 * A tela deriva o vencimento na leitura, e o enum guarda o estado para quando
 * houver quem o escreva.
 */
export const AUTHORIZATION_TRANSITIONS: Record<
  AuthorizationStatus,
  readonly AuthorizationStatus[]
> = {
  /* Desistir antes da resposta: o paciente não voltou, o procedimento mudou. */
  requested: ['canceled'],
  /* Guia aprovada foi consumida, ou perdeu o propósito. */
  approved: ['used', 'canceled'],
  /* Negada é final: contestar é a glosa, e pedir de novo é guia nova. */
  denied: [],
  used: [],
  canceled: [],
  /* Não é escrito aqui; se algum dia for, também é final. */
  expired: [],
}

export function canTransitionAuthorization(
  from: AuthorizationStatus,
  to: AuthorizationStatus,
): boolean {
  return AUTHORIZATION_TRANSITIONS[from].includes(to)
}

/**
 * A guia venceu?
 *
 * Comparação de data, e **não** julgamento sobre usá-la: guia vencida pode ter
 * sido honrada pela operadora, e é a operadora quem decide isso. A tela mostra o
 * fato ao lado do status gravado, sem substituí-lo.
 *
 * Só faz sentido para guia aprovada: uma negada ou cancelada não vence, ela já
 * terminou.
 */
export function isAuthorizationExpired(
  status: AuthorizationStatus,
  expiresAt: Date | null,
  now: Date,
): boolean {
  if (status !== 'approved' || expiresAt === null) return false
  return expiresAt.getTime() < now.getTime()
}

/** Carteirinha de um paciente — o que a tela precisa para abrir uma guia. */
export interface PatientInsuranceOption {
  id: string
  patientName: string
  planName: string
  cardNumber: string
  /** Nula quando a clínica não registrou validade. */
  validUntil: Date | null
}

export interface PatientInsurance {
  id: string
  patientId: string
  patientName: string
  planId: string
  planName: string
  providerName: string
  cardNumber: string
  holderName: string | null
  validUntil: Date | null
  isPrimary: boolean
  isActive: boolean
}

export interface NewPatientInsuranceData {
  patientId: string
  planId: string
  cardNumber: string
  holderName: string | null
  validUntil: Date | null
  isPrimary: boolean
}

export interface InsuranceSummary {
  activeProviders: number
  activePlans: number
  pendingAuthorizations: number
  deniedAuthorizations: number
}

export interface ClaimDenial {
  id: string
  invoiceId: string
  invoiceNumber: number | null
  patientName: string
  planName: string
  invoiceItemDescription: string | null
  denialCode: string | null
  reason: string
  amountCents: number
  status: ClaimDenialStatus
  deniedAt: Date
  appealedAt: Date | null
  resolvedAt: Date | null
  recoveredCents: number | null
  notes: string | null
}

/** Fatura de convênio ainda apta a receber um registro de glosa. */
export interface ClaimInvoiceOption {
  id: string
  label: string
  patientName: string
  invoiceNumber: number | null
  totalCents: number
}

export interface NewClaimDenialData {
  invoiceId: string
  denialCode: string | null
  reason: string
  amountCents: number
  deniedAt: Date
  notes: string | null
}

export type ClaimDenialUpdate =
  | { status: 'appealing'; notes: string | null }
  | { status: 'recovered'; recoveredCents: number; notes: string | null }
  | { status: 'accepted'; notes: string | null }
