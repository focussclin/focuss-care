import type {
  EmergencyContact,
  PatientAddress,
} from '@/modules/_shared/domain/types'

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
    cpf: input.cpf,
    cns: input.cns,
    address: toAddress(input),
  }
}

/**
 * Os sete campos do formulário viram um objeto — ou `null`.
 *
 * `null` quando nenhum deles foi preenchido, e é o que APAGA o endereço gravado:
 * limpar é edição legítima. O schema já recusou o endereço pela metade antes de
 * chegar aqui, então o que passa ou está vazio ou tem rua, cidade e UF.
 */
function toAddress(input: {
  addressZip: string | null
  addressStreet: string | null
  addressNumber: string | null
  addressComplement: string | null
  addressDistrict: string | null
  addressCity: string | null
  addressState: string | null
}): PatientAddress | null {
  const address: PatientAddress = {
    zip: input.addressZip,
    street: input.addressStreet,
    number: input.addressNumber,
    complement: input.addressComplement,
    district: input.addressDistrict,
    city: input.addressCity,
    state: input.addressState,
  }

  return Object.values(address).some((field) => field !== null) ? address : null
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
