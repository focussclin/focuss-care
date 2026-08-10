import type { Allergy } from '../domain/Allergy'
import type { AllergyDto } from '../schemas/allergy.schema'

/**
 * `recordedBy` não cruza a fronteira.
 *
 * A tela não mostra quem registrou, e mandar o id do profissional para o
 * cliente seria expor um dado que nada na interface usa. Ele existe no banco
 * para a auditoria e para a trilha clínica, que são leituras de servidor.
 */
export function toAllergyDto(allergy: Allergy): AllergyDto {
  return {
    id: allergy.id,
    patientId: allergy.patientId,
    substance: allergy.substance,
    reaction: allergy.reaction,
    isActive: allergy.isActive,
    recordedAt: allergy.recordedAt.toISOString(),
  }
}
