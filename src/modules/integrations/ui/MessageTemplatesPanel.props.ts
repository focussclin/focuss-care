import type {
  MessageTemplateDto,
  MessageTemplateFormValues,
} from '../schemas/messageTemplate.schema'

export interface MessageTemplatesPanelProps {
  templates: readonly MessageTemplateDto[]
  onSubmit: (
    values: MessageTemplateFormValues,
    templateId: string | null,
  ) => Promise<string | null>
  onSetActive: (templateId: string, isActive: boolean) => Promise<string | null>
  /** `clinic.settings` — o modelo sai em nome da clínica. */
  canManage: boolean
  isLive: boolean
  /** Falha de leitura: o painel diz o que houve em vez de fingir lista vazia. */
  loadError?: string | null
}
