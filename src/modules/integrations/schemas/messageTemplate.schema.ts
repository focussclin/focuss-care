import { z } from 'zod'

import { hasUnbalancedBraces } from '../domain/MessageTemplate'

export const messageTemplateMessages = {
  invalidFields: 'Revise os campos destacados e tente novamente.',
  nameRequired: 'Dê um nome ao modelo.',
  nameTooLong: 'Use no máximo 120 caracteres.',
  categoryTooLong: 'Use no máximo 80 caracteres na categoria.',
  bodyRequired: 'Escreva o texto do modelo.',
  bodyTooLong: 'Use no máximo 1.024 caracteres.',
  unbalancedBraces:
    'Há um marcador de variável aberto e não fechado. Use {{nome_do_paciente}} — só letras, números e sublinhado.',
  duplicateName:
    'Já existe um modelo com este nome. Nomes repetidos deixam quem escolhe sem saber qual é qual.',
  forbidden: 'Você não tem permissão para gerenciar modelos nesta clínica.',
  notFound: 'Este modelo não está mais disponível nesta clínica.',
  writeForbidden:
    'A lista foi carregada, mas o banco recusou a gravação. Falta policy de escrita em `message_templates` para este papel.',
  unavailable: 'Não foi possível falar com o servidor agora. Tente novamente.',
  unexpected: 'Não foi possível concluir a ação agora. Tente novamente.',
  /** Exibido no topo da biblioteca. Ver o JSDoc do domínio. */
  nothingIsSent:
    'Os modelos ficam guardados para a equipe copiar. Nada é enviado por aqui: o envio depende do provedor de WhatsApp, que não faz parte desta instalação.',
} as const

/**
 * 1.024 caracteres — o teto que os provedores de mensagem praticam.
 *
 * Não é um limite do banco (a coluna é `text`), e sim do destino: um modelo
 * maior seria aceito aqui e recusado no dia em que houvesse envio, quando já
 * estivesse em uso.
 */
const BODY_MAX = 1024

/**
 * `variables`, `is_approved`, `provider_template_id` e `language` NÃO entram
 * neste schema, cada um por um motivo diferente:
 *
 *  - `variables` é derivado do corpo, e digitá-lo permitiria uma lista que
 *    discorda do texto;
 *  - `is_approved` e `provider_template_id` pertencem ao provedor;
 *  - `language` é fixo enquanto o produto é só pt-BR.
 */
const templateShape = {
  name: z
    .string()
    .trim()
    .min(2, messageTemplateMessages.nameRequired)
    .max(120, messageTemplateMessages.nameTooLong),
  category: z
    .union([z.literal(''), z.string().trim().max(80, messageTemplateMessages.categoryTooLong)])
    .transform((value) => value || null),
  body: z
    .string()
    .trim()
    .min(3, messageTemplateMessages.bodyRequired)
    .max(BODY_MAX, messageTemplateMessages.bodyTooLong)
    .refine(
      (value) => !hasUnbalancedBraces(value),
      messageTemplateMessages.unbalancedBraces,
    ),
}

export const createMessageTemplateSchema = z.object(templateShape)
export type CreateMessageTemplateInput = z.infer<typeof createMessageTemplateSchema>

export const updateMessageTemplateSchema = z.object({
  templateId: z.uuid(messageTemplateMessages.notFound),
  ...templateShape,
})
export type UpdateMessageTemplateInput = z.infer<typeof updateMessageTemplateSchema>

export const setMessageTemplateActiveSchema = z.object({
  templateId: z.uuid(messageTemplateMessages.notFound),
  isActive: z.boolean(),
})
export type SetMessageTemplateActiveInput = z.infer<
  typeof setMessageTemplateActiveSchema
>

export interface MessageTemplateDto {
  id: string
  name: string
  category: string | null
  language: string
  body: string
  variables: readonly string[]
  isApproved: boolean
  isActive: boolean
}

export interface MessageTemplateFormValues {
  name: string
  category: string
  body: string
}
