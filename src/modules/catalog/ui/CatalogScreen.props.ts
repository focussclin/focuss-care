import type { ServiceDto, ServiceFormValues } from '../schemas/service.schema'

export interface CatalogScreenProps {
  services: readonly ServiceDto[]
  onSubmit: (
    values: ServiceFormValues,
    serviceId: string | null,
  ) => Promise<string | null>
  onSetActive: (serviceId: string, isActive: boolean) => Promise<string | null>
  onDelete: (serviceId: string) => Promise<string | null>
  /** `clinic.settings` — quem define o que a clínica oferece e por quanto. */
  canManage: boolean
  /**
   * `invoice.read`. Quando falso, a coluna de preço não existe — e o valor
   * também não chegou do servidor.
   */
  canSeePrice: boolean
  isLive: boolean
  /** Falha de leitura: a tela diz o que houve em vez de fingir catálogo vazio. */
  loadError?: string | null
}
