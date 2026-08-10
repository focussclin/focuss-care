import { z } from 'zod'

import { normalizePhone } from '@/lib/utils/phone'

export const patientContactMessages = {
  nameRequired: 'Informe o nome do contato.',
  nameTooLong: 'O nome pode ter no máximo 160 caracteres.',
  relationshipTooLong: 'O vínculo pode ter no máximo 80 caracteres.',
  phoneInvalid: 'Informe um telefone com DDD. Exemplo: (11) 90000-0000.',
  emailTooLong: 'O e-mail pode ter no máximo 254 caracteres.',
  invalidEmail: 'Digite um e-mail válido.',
  notFound: 'Não encontramos o paciente ou contato solicitado.',
  forbidden: 'Você não tem permissão para alterar contatos deste paciente.',
  unavailable: 'Não foi possível falar com o servidor agora. Tente novamente.',
  unexpected: 'Não foi possível salvar o contato agora. Tente novamente.',
  conflict: 'Este contato foi alterado por outra pessoa. Atualize a página e tente novamente.',
} as const

const contactFields = {
  name: z
    .string()
    .trim()
    .min(1, patientContactMessages.nameRequired)
    .max(160, patientContactMessages.nameTooLong),
  relationship: z
    .string()
    .trim()
    .max(80, patientContactMessages.relationshipTooLong)
    .transform((value) => (value === '' ? null : value)),
  phone: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || normalizePhone(value) !== null,
      patientContactMessages.phoneInvalid,
    )
    .transform((value) => (value === '' ? null : normalizePhone(value))),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, patientContactMessages.emailTooLong)
    .refine(
      (value) => value === '' || z.email().safeParse(value).success,
      patientContactMessages.invalidEmail,
    )
    .transform((value) => (value === '' ? null : value)),
  isLegalGuardian: z.boolean(),
}

export const createPatientContactSchema = z.object({
  patientId: z.uuid(),
  ...contactFields,
})

export const updatePatientContactSchema = z.object({
  patientId: z.uuid(),
  contactId: z.uuid(),
  ...contactFields,
})

export type CreatePatientContactInput = z.infer<typeof createPatientContactSchema>
export type UpdatePatientContactInput = z.infer<typeof updatePatientContactSchema>
export type PatientContactField =
  | keyof CreatePatientContactInput
  | keyof UpdatePatientContactInput

