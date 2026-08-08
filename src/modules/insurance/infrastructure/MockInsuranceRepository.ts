import type {
  Authorization,
  ClaimDenial,
  ClaimInvoiceOption,
  InsurancePlan,
  InsuranceProvider,
  InsuranceSummary,
  PatientInsuranceOption,
} from '../domain/Insurance'
import type { InsuranceRepository } from '../domain/InsuranceRepository'
import { InsuranceRepositoryError } from '../domain/InsuranceRepositoryError'

/**
 * Fallback usado enquanto o Supabase não está configurado.
 *
 * Vazio, pela mesma razão do financeiro: uma guia fictícia informaria que um
 * procedimento está autorizado. Alguém marcaria o atendimento em cima disso, e
 * a operadora recusaria o pagamento depois — com o atendimento já prestado.
 */
export class MockInsuranceRepository implements InsuranceRepository {
  async listProviders(): Promise<InsuranceProvider[]> {
    return []
  }

  async listPlans(): Promise<InsurancePlan[]> {
    return []
  }

  async listAuthorizations(): Promise<Authorization[]> {
    return []
  }

  async listPatientInsurances(): Promise<PatientInsuranceOption[]> {
    return []
  }

  async summary(): Promise<InsuranceSummary> {
    return {
      activeProviders: 0,
      activePlans: 0,
      pendingAuthorizations: 0,
      deniedAuthorizations: 0,
    }
  }

  async createProvider(): Promise<never> {
    return this.refuseWrite('createProvider')
  }

  async setProviderActive(): Promise<never> {
    return this.refuseWrite('setProviderActive')
  }

  async createPlan(): Promise<never> {
    return this.refuseWrite('createPlan')
  }

  async createAuthorization(): Promise<never> {
    return this.refuseWrite('createAuthorization')
  }

  async answerAuthorization(): Promise<never> {
    return this.refuseWrite('answerAuthorization')
  }

  async listClaimDenials(): Promise<ClaimDenial[]> {
    return []
  }

  async listClaimInvoiceOptions(): Promise<ClaimInvoiceOption[]> {
    return []
  }

  async createClaimDenial(): Promise<never> {
    return this.refuseWrite('createClaimDenial')
  }

  async updateClaimDenial(): Promise<never> {
    return this.refuseWrite('updateClaimDenial')
  }

  private refuseWrite(operation: string): never {
    throw new InsuranceRepositoryError(
      'unavailable',
      `MockInsuranceRepository nao persiste (${operation}): escrita real exige Supabase configurado.`,
    )
  }
}
