import type { EmergencyContact } from '@/modules/_shared/domain/types'

import type { NewPatientData } from '../domain/PatientRepository'
import type { CreatePatientInput } from '../schemas/patient.schema'

/**
 * Entrada validada -> o que o repositório grava.
 *
 * Um lugar só para cadastro e edição. Antes de P-01 completa cada action montava
 * o objeto inline, com cinco campos; com dez, duas cópias divergiriam no
 * primeiro campo novo — e a que esquecesse `emergencyContact` apagaria o contato
 * a cada save, em silêncio.
 */
export function toNewPatientData(
  input: Omit<CreatePatientInput, 'phone'> & { phone: string | null },
): NewPatientData {
  return {
    fullName: input.name,
    socialName: input.socialName,
    birthDate: input.birthDate,
    phone: input.phone,
    phoneAlt: input.phoneAlt,
    email: input.email,
    biologicalSex: input.biologicalSex,
    genderIdentity: input.genderIdentity,
    emergencyContact: toEmergencyContact(input),
    adminNotes: input.notes,
  }
}

/**
 * Os três campos do formulário viram um objeto — ou `null`.
 *
 * `null` quando não há nome nem telefone, e é o que APAGA o contato gravado:
 * limpar os campos é edição legítima, e um contato errado numa emergência é pior
 * que nenhum. O schema já recusou a metade preenchida antes de chegar aqui.
 */
function toEmergencyContact(input: {
  emergencyContactName: string | null
  emergencyContactPhone: string | null
  emergencyContactRelationship: string | null
}): EmergencyContact | null {
  if (!input.emergencyContactName || !input.emergencyContactPhone) return null

  return {
    name: input.emergencyContactName,
    phone: input.emergencyContactPhone,
    relationship: input.emergencyContactRelationship,
  }
}
