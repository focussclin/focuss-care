import { formatPhone } from '@/lib/utils/phone'

import type { PatientContact } from '../domain/PatientContactRepository'

export interface PatientContactDto {
  id: string
  patientId: string
  name: string
  relationship: string | null
  /** Forma legivel; o banco continua recebendo apenas digitos. */
  phone: string | null
  email: string | null
  isLegalGuardian: boolean
  createdAt: string
  updatedAt: string
}

export function toPatientContactDto(contact: PatientContact): PatientContactDto {
  return {
    id: contact.id,
    patientId: contact.patientId,
    name: contact.name,
    relationship: contact.relationship,
    phone: contact.phone ? formatPhone(contact.phone) : null,
    email: contact.email,
    isLegalGuardian: contact.isLegalGuardian,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString(),
  }
}
