import { z } from 'zod'

import { PATIENT_TAG_COLORS, type PatientTagColor } from '../domain/PatientTag'

export const patientTagMessages = {
  nameRequired: 'Informe o nome da tag.',
  nameTooLong: 'Use no máximo 40 caracteres.',
  colorInvalid: 'Escolha uma cor válida.',
  patientInvalid: 'Paciente inválido.',
  tagInvalid: 'Tag inválida.',
  schemaPending:
    'As tags ainda não estão preparadas no banco. Aplique a migration indicada e tente novamente.',
  forbidden: 'Você não tem permissão para gerenciar tags deste paciente.',
  notFound: 'Paciente ou tag não encontrada nesta clínica.',
  conflict: 'Esta tag já está vinculada a este paciente.',
  unavailable: 'Não foi possível acessar as tags agora. Tente novamente.',
  unexpected: 'Não foi possível concluir a operação agora. Tente novamente.',
} as const

export const addPatientTagSchema = z.object({
  patientId: z.uuid(patientTagMessages.patientInvalid),
  name: z
    .string()
    .trim()
    .min(1, patientTagMessages.nameRequired)
    .max(40, patientTagMessages.nameTooLong),
  color: z.enum(PATIENT_TAG_COLORS, patientTagMessages.colorInvalid),
})
export type AddPatientTagInput = z.infer<typeof addPatientTagSchema>

export const removePatientTagSchema = z.object({
  patientId: z.uuid(patientTagMessages.patientInvalid),
  tagId: z.uuid(patientTagMessages.tagInvalid),
})
export type RemovePatientTagInput = z.infer<typeof removePatientTagSchema>

export interface PatientTagDto {
  id: string
  name: string
  color: PatientTagColor
}
