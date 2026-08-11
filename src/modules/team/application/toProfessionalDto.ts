import { canSign, formatCouncil, type Professional } from '../domain/Professional'
import type { ProfessionalDto } from '../schemas/professional.schema'

/**
 * Entidade -> o que atravessa a fronteira da Server Action.
 *
 * `canSign` é resolvido AQUI, no servidor, e não recalculado na tela. É a mesma
 * regra que decide se `current_professional_id()` vai encontrar alguém, e
 * duplicá-la no cliente é como as duas versões começam a discordar.
 */
export function toProfessionalDto(professional: Professional): ProfessionalDto {
  return {
    id: professional.id,
    displayName: professional.displayName,
    councilType: professional.councilType,
    councilNumber: professional.councilNumber,
    councilState: professional.councilState,
    council: formatCouncil(professional),
    specialties: professional.specialties,
    defaultSlotMinutes: professional.defaultSlotMinutes,
    isActive: professional.isActive,
    linkedUserId: professional.userId,
    canSign: canSign(professional),
  }
}
