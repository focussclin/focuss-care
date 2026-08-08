import type { AuthorizationStatus } from '@/lib/supabase/database.types'

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
 * # O que NÃO existe no schema, e por que importa dizer
 *
 * **Glosa não tem tabela.** `AuthorizationStatus` tem `denied`, e isso é outra
 * coisa: negativa de autorização PRÉVIA, que acontece antes do atendimento. A
 * glosa é a recusa de pagamento DEPOIS da fatura enviada — mesmo procedimento
 * autorizado, mesmo atendimento feito, e a operadora não paga. Não há coluna,
 * tabela nem status que a represente. Ver `InsuranceRepository`.
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

/** Carteirinha de um paciente — o que a tela precisa para abrir uma guia. */
export interface PatientInsuranceOption {
  id: string
  patientName: string
  planName: string
  cardNumber: string
  /** Nula quando a clínica não registrou validade. */
  validUntil: Date | null
}

export interface InsuranceSummary {
  activeProviders: number
  activePlans: number
  pendingAuthorizations: number
  deniedAuthorizations: number
}
