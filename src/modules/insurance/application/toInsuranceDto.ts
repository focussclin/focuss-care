import type {
  Authorization,
  ClaimDenial,
  ClaimInvoiceOption,
  InsurancePlan,
  InsuranceProvider,
  InsuranceSummary,
  PatientInsuranceOption,
} from '../domain/Insurance'
import type {
  AuthorizationDto,
  ClaimDenialDto,
  ClaimInvoiceOptionDto,
  InsuranceSummaryDto,
  PatientInsuranceDto,
  PlanDto,
  ProviderDto,
} from '../schemas/insurance.schema'

/**
 * Entidade -> o que atravessa a fronteira.
 *
 * `cnpj` e `notes` da operadora NÃO viajam: a lista não os mostra, e campo que a
 * tela não usa é superfície de graça. O número da carteirinha aparece no rótulo
 * porque é assim que a recepção distingue duas carteirinhas do mesmo paciente —
 * e ele já está visível no cadastro do paciente.
 */
export function toProviderDto(provider: InsuranceProvider): ProviderDto {
  return {
    id: provider.id,
    name: provider.name,
    ansCode: provider.ansCode,
    isActive: provider.isActive,
    activePlans: provider.activePlans,
  }
}

export function toPlanDto(plan: InsurancePlan): PlanDto {
  return {
    id: plan.id,
    providerName: plan.providerName,
    name: plan.name,
    planCode: plan.planCode,
    copayCents: plan.copayCents,
    paymentTermDays: plan.paymentTermDays,
    isActive: plan.isActive,
  }
}

export function toAuthorizationDto(
  authorization: Authorization,
): AuthorizationDto {
  return {
    id: authorization.id,
    patientName: authorization.patientName,
    planName: authorization.planName,
    providerName: authorization.providerName,
    authorizationNumber: authorization.authorizationNumber,
    status: authorization.status,
    procedures: authorization.procedures.map((procedure) => ({
      code: procedure.code,
      description: procedure.description,
      quantity: procedure.quantity,
    })),
    requestedAt: authorization.requestedAt.toISOString(),
    expiresAt: authorization.expiresAt?.toISOString() ?? null,
    denialReason: authorization.denialReason,
  }
}

export function toPatientInsuranceDto(
  option: PatientInsuranceOption,
): PatientInsuranceDto {
  return {
    id: option.id,
    label: `${option.patientName} · ${option.planName} · ${option.cardNumber}`,
    validUntil: option.validUntil?.toISOString() ?? null,
  }
}

export function toInsuranceSummaryDto(
  summary: InsuranceSummary,
): InsuranceSummaryDto {
  return {
    activeProviders: summary.activeProviders,
    activePlans: summary.activePlans,
    pendingAuthorizations: summary.pendingAuthorizations,
    deniedAuthorizations: summary.deniedAuthorizations,
  }
}

export function toClaimDenialDto(denial: ClaimDenial): ClaimDenialDto {
  return {
    id: denial.id,
    invoiceId: denial.invoiceId,
    invoiceNumber: denial.invoiceNumber,
    patientName: denial.patientName,
    planName: denial.planName,
    invoiceItemDescription: denial.invoiceItemDescription,
    denialCode: denial.denialCode,
    reason: denial.reason,
    amountCents: denial.amountCents,
    status: denial.status,
    deniedAt: denial.deniedAt.toISOString(),
    appealedAt: denial.appealedAt?.toISOString() ?? null,
    resolvedAt: denial.resolvedAt?.toISOString() ?? null,
    recoveredCents: denial.recoveredCents,
    notes: denial.notes,
  }
}

export function toClaimInvoiceOptionDto(
  invoice: ClaimInvoiceOption,
): ClaimInvoiceOptionDto {
  return { id: invoice.id, label: invoice.label }
}
