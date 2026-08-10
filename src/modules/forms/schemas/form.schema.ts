import { z } from 'zod'

import {
  FORM_FIELD_TYPES,
  FORM_STATUSES,
  FORM_TYPES,
  type FormFieldType,
  type FormStatus,
  type FormType,
} from '../domain/Form'

export const formMessages = {
  invalidFields: 'Revise os campos destacados e tente novamente.',
  nameRequired: 'Informe o nome do formulário.',
  nameTooLong: 'Use no máximo 120 caracteres.',
  descriptionTooLong: 'Use no máximo 500 caracteres na descrição.',
  typeInvalid: 'Escolha um tipo de formulário válido.',
  statusInvalid: 'Escolha um status válido.',
  fieldsRequired: 'Adicione pelo menos um campo ao formulário.',
  tooManyFields: 'Um formulário pode ter no máximo 50 campos.',
  fieldLabelRequired: 'Informe o rótulo do campo.',
  fieldLabelTooLong: 'Use no máximo 160 caracteres no rótulo.',
  fieldHelpTooLong: 'Use no máximo 240 caracteres na ajuda do campo.',
  fieldTypeInvalid: 'Escolha um tipo de campo válido.',
  optionsInvalid: 'Informe opções válidas para este campo.',
  schemaPending:
    'Os formulários ainda estão sendo preparados no banco. Aplique a migration indicada e tente novamente.',
  forbidden: 'Você não tem permissão para gerenciar formulários nesta clínica.',
  notFound: 'Este formulário não está mais disponível nesta clínica.',
  unavailable: 'Não foi possível falar com o servidor agora. Tente novamente.',
  unexpected: 'Não foi possível concluir a ação agora. Tente novamente.',
} as const

const fieldSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z
    .string()
    .trim()
    .min(1, formMessages.fieldLabelRequired)
    .max(160, formMessages.fieldLabelTooLong),
  type: z.enum(FORM_FIELD_TYPES, formMessages.fieldTypeInvalid),
  required: z.boolean(),
  helpText: z
    .union([z.literal(''), z.string().trim().max(240, formMessages.fieldHelpTooLong)])
    .transform((value) => value || null),
  options: z
    .array(z.string().trim().min(1, formMessages.optionsInvalid).max(120, formMessages.optionsInvalid))
    .max(50, formMessages.optionsInvalid),
})

const formDataShape = {
  name: z
    .string()
    .trim()
    .min(2, formMessages.nameRequired)
    .max(120, formMessages.nameTooLong),
  description: z
    .union([z.literal(''), z.string().trim().max(500, formMessages.descriptionTooLong)])
    .transform((value) => value || null),
  type: z.enum(FORM_TYPES, formMessages.typeInvalid),
  status: z.enum(FORM_STATUSES, formMessages.statusInvalid),
  fields: z
    .array(fieldSchema)
    .min(1, formMessages.fieldsRequired)
    .max(50, formMessages.tooManyFields),
}

export const createFormSchema = z.object(formDataShape)
export type CreateFormInput = z.infer<typeof createFormSchema>

export const updateFormSchema = z.object({
  formId: z.uuid(formMessages.unexpected),
  ...formDataShape,
})
export type UpdateFormInput = z.infer<typeof updateFormSchema>

export const setFormStatusSchema = z.object({
  formId: z.uuid(formMessages.unexpected),
  status: z.enum(FORM_STATUSES, formMessages.statusInvalid),
})
export type SetFormStatusInput = z.infer<typeof setFormStatusSchema>

export interface FormFieldDto {
  id: string
  label: string
  type: FormFieldType
  required: boolean
  helpText: string | null
  options: readonly string[]
}

export interface FormDto {
  id: string
  name: string
  description: string | null
  type: FormType
  status: FormStatus
  fields: readonly FormFieldDto[]
  version: number
  createdAt: string
  updatedAt: string
}

export interface FormFormValues {
  name: string
  description: string
  type: FormType
  status: FormStatus
  fields: readonly FormFieldDto[]
}
