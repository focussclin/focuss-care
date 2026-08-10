import type { Service } from '../domain/Service'
import type { ServiceDto } from '../schemas/service.schema'

/**
 * O preço é omitido no SERVIDOR para quem não pode vê-lo.
 *
 * A matriz de permissões é explícita: "`receptionist` não vê valor nenhum —
 * marcar consulta não exige saber quanto ela custa nem o que o paciente deve".
 * Mandar o número e escondê-lo na tela deixaria o valor no HTML e na resposta
 * da action, ao alcance de qualquer um que abrisse o inspetor. O que não pode
 * ser visto não atravessa a fronteira.
 *
 * Nome, código e duração continuam indo: são operacionais, e sem eles a
 * recepção não consegue marcar.
 */
export function toServiceDto(service: Service, canSeePrice: boolean): ServiceDto {
  return {
    id: service.id,
    code: service.code,
    tussCode: service.tussCode,
    name: service.name,
    description: service.description,
    category: service.category,
    defaultDurationMinutes: service.defaultDurationMinutes,
    defaultPriceCents: canSeePrice ? service.defaultPriceCents : null,
    requiresAuthorization: service.requiresAuthorization,
    isActive: service.isActive,
  }
}
