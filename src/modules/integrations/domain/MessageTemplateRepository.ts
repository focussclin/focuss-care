import type { MessageTemplate, NewMessageTemplateData } from './MessageTemplate'

export type MessageTemplateErrorReason =
  | 'forbidden'
  /**
   * O modelo é legível, mas a escrita não alcançou a linha.
   *
   * Sem policy de UPDATE em `message_templates` para o papel, o Postgres não
   * devolve erro: zero linhas mudam, em silêncio.
   */
  | 'write-forbidden'
  | 'duplicate'
  | 'not-found'
  | 'unavailable'
  | 'unexpected'

export class MessageTemplateError extends Error {
  constructor(
    readonly reason: MessageTemplateErrorReason,
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'MessageTemplateError'
  }
}

export function isMessageTemplateError(
  cause: unknown,
): cause is MessageTemplateError {
  return cause instanceof MessageTemplateError
}

/**
 * **Nenhum método escreve `is_approved` nem `provider_template_id`.**
 *
 * As duas colunas pertencem a quem aprova modelo de mensagem — a Meta, no caso
 * do WhatsApp Business. A aplicação as lê e exibe; escrevê-las seria afirmar
 * uma aprovação que ninguém deu.
 *
 * Também não há `send`: não existe provedor, e um método com esse nome aqui
 * seria um convite para alguém implementá-lo simulando envio.
 */
export interface MessageTemplateRepository {
  list(clinicId: string): Promise<MessageTemplate[]>
  create(clinicId: string, data: NewMessageTemplateData): Promise<MessageTemplate>
  update(
    clinicId: string,
    templateId: string,
    data: NewMessageTemplateData,
  ): Promise<MessageTemplate>
  setActive(
    clinicId: string,
    templateId: string,
    isActive: boolean,
  ): Promise<MessageTemplate>
}
