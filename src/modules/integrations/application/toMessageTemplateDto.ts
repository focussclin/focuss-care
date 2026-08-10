import type { MessageTemplate } from '../domain/MessageTemplate'
import type { MessageTemplateDto } from '../schemas/messageTemplate.schema'

/**
 * `providerTemplateId` não cruza a fronteira.
 *
 * É o identificador do modelo no provedor externo, e nada na tela o usa —
 * mandá-lo ao cliente exporia um dado de integração sem nenhum ganho. O que a
 * tela precisa saber sobre o provedor cabe em `isApproved`.
 */
export function toMessageTemplateDto(template: MessageTemplate): MessageTemplateDto {
  return {
    id: template.id,
    name: template.name,
    category: template.category,
    language: template.language,
    body: template.body,
    variables: template.variables,
    isApproved: template.isApproved,
    isActive: template.isActive,
  }
}
