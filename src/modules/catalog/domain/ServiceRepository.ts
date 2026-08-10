import type { NewServiceData, Service, ServiceUpdateData } from './Service'

export type ServiceRepositoryErrorReason =
  | 'forbidden'
  /**
   * O serviço é legível, mas a escrita não alcançou a linha.
   *
   * Sem policy de INSERT/UPDATE em `services` para o papel, o Postgres não
   * devolve erro: zero linhas mudam, em silêncio.
   */
  | 'write-forbidden'
  | 'duplicate'
  | 'not-found'
  | 'unavailable'
  | 'unexpected'

export class ServiceRepositoryError extends Error {
  constructor(
    readonly reason: ServiceRepositoryErrorReason,
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'ServiceRepositoryError'
  }
}

export function isServiceRepositoryError(
  cause: unknown,
): cause is ServiceRepositoryError {
  return cause instanceof ServiceRepositoryError
}

export interface ServiceRepository {
  list(clinicId: string): Promise<Service[]>
  create(clinicId: string, data: NewServiceData): Promise<Service>
  update(clinicId: string, serviceId: string, data: ServiceUpdateData): Promise<Service>
  setActive(clinicId: string, serviceId: string, isActive: boolean): Promise<Service>
  /**
   * Exclusão LÓGICA — grava `deleted_at`, nunca apaga a linha.
   *
   * `invoice_items.service_id` pode apontar para o serviço. Apagar de verdade
   * deixaria faturas antigas sem saber o que foi cobrado, e é justamente o
   * histórico que o financeiro precisa conseguir reconstruir.
   */
  softDelete(clinicId: string, serviceId: string): Promise<void>
}
