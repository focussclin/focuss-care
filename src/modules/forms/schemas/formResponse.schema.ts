import { z } from 'zod'

import { FORM_RESPONSE_STATUSES, type FormResponseStatus } from '../domain/FormResponse'

export const formResponseMessages = {
  invalidFields: 'Revise as respostas destacadas e tente novamente.',
  formNotFound: 'Este formulário não está publicado ou não está mais disponível.',
  patientRequired: 'Selecione um paciente para registrar a resposta.',
  requiredField: 'Preencha todos os campos obrigatórios.',
  unsupportedField:
    'Este formulário possui assinatura ou upload. Configure a integração correspondente antes de enviá-lo.',
  unknownField: 'O formulário foi alterado. Atualize a página e tente novamente.',
  conflict: 'Esta resposta não pertence ao formulário selecionado.',
  schemaPending:
    'As respostas ainda estão sendo preparadas no banco. Aplique a migration indicada e tente novamente.',
  forbidden: 'Você não tem permissão para registrar respostas nesta clínica.',
  notFound: 'Esta resposta não está mais disponível nesta clínica.',
  unavailable: 'Não foi possível falar com o servidor agora. Tente novamente.',
  unexpected: 'Não foi possível concluir a resposta agora. Tente novamente.',
} as const

const answerValue = z.union([
  z.string().max(5000, formResponseMessages.invalidFields),
  z.array(z.string().max(200, formResponseMessages.invalidFields)).max(50),
])

export const formAnswersSchema = z.record(z.string().min(1).max(80), answerValue)

const responseDataShape = {
  formId: z.uuid(formResponseMessages.formNotFound),
  patientId: z.uuid(formResponseMessages.patientRequired),
  responseId: z.union([z.null(), z.uuid(formResponseMessages.notFound)]).default(null),
  status: z.enum(FORM_RESPONSE_STATUSES, formResponseMessages.invalidFields),
  answers: formAnswersSchema,
}

export const saveFormResponseSchema = z.object(responseDataShape)
export type SaveFormResponseInput = z.infer<typeof saveFormResponseSchema>

export interface FormResponseDto {
  id: string
  formId: string
  patientId: string
  status: FormResponseStatus
  answers: Readonly<Record<string, string | readonly string[]>>
  submittedAt: string | null
  createdAt: string
  updatedAt: string
}
