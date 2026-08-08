import type { PatientConsent } from '../domain/PatientConsentRepository'
import type { PatientConsentDto } from '../schemas/patientConsent.schema'

/**
 * Entidade -> o que atravessa a fronteira da Server Action.
 *
 * Duas conversoes e uma derivacao, e nada mais:
 *
 *  1. `Date` vira string ISO — `Date` nao sobrevive a serializacao de uma Server
 *     Action (docs/06-acoes-e-auditoria.md §2).
 *  2. `isActive` e derivado, nao transportado: `revoked_at is null` e a definicao
 *     de vigente, e calcula-la no servidor evita que duas telas discordem sobre o
 *     que significa "ativo".
 *
 * O DTO nao ganha nada que a entidade nao tenha. E a entidade ja nao tem
 * `clinic_id`, `subject_id`, `ip` nem `user_agent`: o adapter nao os seleciona.
 * Sao tres barreiras na mesma direcao (SELECT, entidade, DTO) porque este e o
 * caminho que termina em `props` de Client Component.
 */
export function toPatientConsentDto(consent: PatientConsent): PatientConsentDto {
  return {
    id: consent.id,
    purpose: consent.purpose,
    documentVersion: consent.documentVersion,
    grantedAt: consent.grantedAt.toISOString(),
    revokedAt: consent.revokedAt ? consent.revokedAt.toISOString() : null,
    isActive: consent.revokedAt === null,
  }
}
