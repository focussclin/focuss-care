import type {
  FinanceSummary,
  Invoice,
  OpenCashSession,
} from '../domain/Billing'
import type { BillingRepository } from '../domain/BillingRepository'
import { BillingRepositoryError } from '../domain/BillingRepositoryError'

/**
 * Fallback usado enquanto o Supabase não está configurado.
 *
 * # Aqui a demonstração é VAZIA, e é de propósito
 *
 * Os outros módulos derivam a demonstração de `clinic-data` — há pacientes e
 * agenda fictícios, e mostrá-los é coerente. **Não há cobrança fictícia**, e
 * inventar uma seria pior que em qualquer outra tela: número de dinheiro é o
 * que alguém confere uma vez, acredita, e repete para o contador.
 *
 * A tela vazia diz a verdade: sem banco, não há financeiro.
 */
export class MockBillingRepository implements BillingRepository {
  async listInvoices(): Promise<Invoice[]> {
    return []
  }

  async summary(_clinicId: string, from: Date, to: Date): Promise<FinanceSummary> {
    return {
      from,
      to,
      receivedCents: 0,
      openCents: 0,
      openInvoices: 0,
      issuedInvoices: 0,
    }
  }

  async currentCashSession(): Promise<OpenCashSession | null> {
    return null
  }

  async createInvoice(): Promise<never> {
    return this.refuseWrite('createInvoice')
  }

  async cancelInvoice(): Promise<never> {
    return this.refuseWrite('cancelInvoice')
  }

  async registerPayment(): Promise<never> {
    return this.refuseWrite('registerPayment')
  }

  async openCashSession(): Promise<never> {
    return this.refuseWrite('openCashSession')
  }

  async addCashEntry(): Promise<never> {
    return this.refuseWrite('addCashEntry')
  }

  async closeCashSession(): Promise<never> {
    return this.refuseWrite('closeCashSession')
  }

  /**
   * Escrita não existe na demonstração.
   *
   * Devolver o objeto daria "pagamento registrado" para algo que não saiu da
   * memória do processo. Em dinheiro, isso não é uma inconveniência: é a
   * clínica achando que recebeu.
   */
  private refuseWrite(operation: string): never {
    throw new BillingRepositoryError(
      'unavailable',
      `MockBillingRepository nao persiste (${operation}): escrita real exige Supabase configurado.`,
    )
  }
}
