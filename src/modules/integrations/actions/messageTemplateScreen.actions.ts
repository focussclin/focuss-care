'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { err, ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toMessageTemplateFailure } from '../application/messageTemplateFailure'
import { toMessageTemplateDto } from '../application/toMessageTemplateDto'
import { messageTemplateRepositoryFor } from '../infrastructure/message-template-repository'
import {
  createMessageTemplateSchema,
  messageTemplateMessages,
  setMessageTemplateActiveSchema,
  updateMessageTemplateSchema,
  type CreateMessageTemplateInput,
  type MessageTemplateDto,
  type MessageTemplateFormValues,
  type SetMessageTemplateActiveInput,
  type UpdateMessageTemplateInput,
} from '../schemas/messageTemplate.schema'

type WriteFields = 'name' | 'category' | 'body'

/*
 * `clinic.settings` — o modelo é texto institucional.
 *
 * Ele sai em nome da clínica para o paciente, e ajustá-lo muda o que toda a
 * equipe manda. É a mesma natureza do horário de funcionamento e do catálogo de
 * serviços.
 *
 * **Nenhuma destas actions envia nada.** Não há provedor, não há fila, e não
 * existe uma action de envio neste arquivo nem em lugar nenhum do módulo.
 */
const WRITE_ROLES = rolesWith('clinic.settings')

/**
 * Nome repetido deixa quem escolhe sem saber qual é qual.
 *
 * A checagem roda no SERVIDOR, sobre a lista lida do banco — nunca sobre o que
 * a tela mostrava. Ignora a própria linha na edição: renomear "Confirmação"
 * para "Confirmação" não pode colidir consigo mesma.
 */
function findSameName(
  templates: readonly { id: string; name: string }[],
  name: string,
  exceptId?: string,
): boolean {
  const target = name.trim().toLocaleLowerCase('pt-BR')
  return templates.some(
    (template) =>
      template.id !== exceptId &&
      template.name.trim().toLocaleLowerCase('pt-BR') === target,
  )
}

const runCreateTemplate = createAction<
  CreateMessageTemplateInput,
  MessageTemplateDto,
  WriteFields
>({
  name: 'message_template.create',
  schema: createMessageTemplateSchema,
  roles: WRITE_ROLES,
  messages: {
    validation: messageTemplateMessages.invalidFields,
    unavailable: messageTemplateMessages.unavailable,
    unexpected: messageTemplateMessages.unexpected,
  },
  revalidatePaths: ['/whatsapp'],
  handler: async (input, context) => {
    try {
      const repository = messageTemplateRepositoryFor(context.supabase)
      const existing = await repository.list(context.clinicId)

      if (findSameName(existing, input.name)) {
        return err<WriteFields>('conflict', messageTemplateMessages.duplicateName)
      }

      const template = await repository.create(context.clinicId, input)
      return ok(toMessageTemplateDto(template))
    } catch (cause) {
      return toMessageTemplateFailure<WriteFields>('message_template.create', cause)
    }
  },
  audit: (output) => ({
    action: 'message_template.created',
    entityType: 'message_template',
    entityId: output.id,
    after: { name: output.name, variable_count: output.variables.length },
  }),
})

const runUpdateTemplate = createAction<
  UpdateMessageTemplateInput,
  MessageTemplateDto,
  WriteFields | 'templateId'
>({
  name: 'message_template.update',
  schema: updateMessageTemplateSchema,
  roles: WRITE_ROLES,
  messages: {
    validation: messageTemplateMessages.invalidFields,
    unavailable: messageTemplateMessages.unavailable,
    unexpected: messageTemplateMessages.unexpected,
  },
  revalidatePaths: ['/whatsapp'],
  handler: async (input, context) => {
    const { templateId, ...data } = input
    try {
      const repository = messageTemplateRepositoryFor(context.supabase)
      const existing = await repository.list(context.clinicId)

      if (findSameName(existing, data.name, templateId)) {
        return err<WriteFields | 'templateId'>(
          'conflict',
          messageTemplateMessages.duplicateName,
        )
      }

      const template = await repository.update(context.clinicId, templateId, data)
      return ok(toMessageTemplateDto(template))
    } catch (cause) {
      return toMessageTemplateFailure<WriteFields | 'templateId'>(
        'message_template.update',
        cause,
      )
    }
  },
  audit: (output) => ({
    action: 'message_template.updated',
    entityType: 'message_template',
    entityId: output.id,
    after: { name: output.name, variable_count: output.variables.length },
  }),
})

const runSetTemplateActive = createAction<
  SetMessageTemplateActiveInput,
  MessageTemplateDto,
  'templateId' | 'isActive'
>({
  name: 'message_template.set_active',
  schema: setMessageTemplateActiveSchema,
  roles: WRITE_ROLES,
  messages: {
    validation: messageTemplateMessages.invalidFields,
    unavailable: messageTemplateMessages.unavailable,
    unexpected: messageTemplateMessages.unexpected,
  },
  revalidatePaths: ['/whatsapp'],
  handler: async (input, context) => {
    try {
      const template = await messageTemplateRepositoryFor(context.supabase).setActive(
        context.clinicId,
        input.templateId,
        input.isActive,
      )
      return ok(toMessageTemplateDto(template))
    } catch (cause) {
      return toMessageTemplateFailure<'templateId' | 'isActive'>(
        'message_template.set_active',
        cause,
      )
    }
  },
  audit: (output) => ({
    action: output.isActive
      ? 'message_template.activated'
      : 'message_template.deactivated',
    entityType: 'message_template',
    entityId: output.id,
    after: { is_active: output.isActive },
  }),
})

export async function createMessageTemplateAction(
  rawInput: unknown,
): Promise<ActionResult<MessageTemplateDto, WriteFields>> {
  return runCreateTemplate(rawInput)
}

export async function updateMessageTemplateAction(
  rawInput: unknown,
): Promise<ActionResult<MessageTemplateDto, WriteFields | 'templateId'>> {
  return runUpdateTemplate(rawInput)
}

export async function submitMessageTemplateFromScreen(
  values: MessageTemplateFormValues,
  templateId: string | null,
): Promise<string | null> {
  const result = templateId
    ? await runUpdateTemplate({ templateId, ...values })
    : await runCreateTemplate(values)
  return result.ok ? null : result.error.message
}

export async function setMessageTemplateActiveFromScreen(
  templateId: string,
  isActive: boolean,
): Promise<string | null> {
  const result = await runSetTemplateActive({ templateId, isActive })
  return result.ok ? null : result.error.message
}
