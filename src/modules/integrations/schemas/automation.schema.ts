import { z } from 'zod'

import type { MembershipRole, WorkflowTrigger } from '@/lib/supabase/database.types'

import {
  MAX_ACTIONS,
  MAX_CONDITIONS,
  WORKFLOW_TRIGGERS,
  triggerMatchesConfig,
  type AutomationAction,
  type NewAutomationRuleData,
  type AutomationCondition,
  type AutomationTriggerConfig,
} from '../domain/Automation'

export const automationMessages = {
  invalidFields: 'Revise os campos destacados e tente novamente.',
  nameRequired: 'Dê um nome à regra.',
  nameTooLong: 'Use no máximo 120 caracteres.',
  descriptionTooLong: 'Use no máximo 500 caracteres.',
  triggerInvalid: 'Escolha um gatilho da lista.',
  triggerConfigMismatch: 'A configuração não corresponde ao gatilho escolhido.',
  hoursBeforeInvalid: 'A antecedência deve ser de 1 a 168 horas.',
  timeInvalid: 'Informe um horário no formato HH:MM.',
  weekdaysRequired: 'Escolha ao menos um dia da semana.',
  weekdayInvalid: 'Dia da semana inválido.',
  hourRangeInvalid: 'A hora final deve ser maior que a inicial.',
  conditionsTooMany: `Use no máximo ${MAX_CONDITIONS} condições.`,
  actionsRequired: 'Adicione ao menos uma ação — uma regra sem ação não faz nada.',
  actionsTooMany: `Use no máximo ${MAX_ACTIONS} ações.`,
  rolesRequired: 'Escolha ao menos um papel para notificar.',
  messageRequired: 'Escreva a mensagem da notificação.',
  messageTooLong: 'Use no máximo 280 caracteres.',
  taskTitleRequired: 'Dê um título à tarefa.',
  dueInDaysInvalid: 'O prazo deve ser de 0 a 90 dias.',
  forbidden: 'Você não tem permissão para gerenciar automações nesta clínica.',
  notFound: 'Esta regra não está mais disponível nesta clínica.',
  writeForbidden:
    'A regra foi carregada, mas o banco recusou a alteração. Falta policy de escrita em `workflows` para este papel.',
  hasRuns:
    'Esta regra já tem execuções registradas e não pode ser excluída. Desative-a para parar de usá-la.',
  unavailable: 'Não foi possível falar com o servidor agora. Tente novamente.',
  unexpected: 'Não foi possível concluir a ação agora. Tente novamente.',
} as const

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

const MEMBERSHIP_ROLES = [
  'owner',
  'admin',
  'professional',
  'receptionist',
  'finance',
] as const satisfies readonly MembershipRole[]

/**
 * Configuração do gatilho — união discriminada, sem `passthrough`.
 *
 * `trigger_config` é `jsonb`: o banco aceita qualquer objeto. Se este schema
 * deixasse passar chave desconhecida, o formulário viraria um canal para gravar
 * estrutura arbitrária no tenant, e o worker futuro leria isso como instrução.
 * Zod já descarta chave extra por padrão; o que importa é **não** afrouxar.
 */
export const triggerConfigSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('event') }),
  z.object({
    kind: z.literal('reminder'),
    hoursBefore: z
      .number()
      .int(automationMessages.hoursBeforeInvalid)
      .min(1, automationMessages.hoursBeforeInvalid)
      .max(168, automationMessages.hoursBeforeInvalid),
  }),
  z.object({
    kind: z.literal('schedule'),
    time: z.string().regex(TIME, automationMessages.timeInvalid),
    weekdays: z
      .array(z.number().int(automationMessages.weekdayInvalid).min(0, automationMessages.weekdayInvalid).max(6, automationMessages.weekdayInvalid))
      .min(1, automationMessages.weekdaysRequired)
      .max(7, automationMessages.weekdayInvalid)
      // Dia repetido não muda o efeito e sujaria a linha gravada.
      .transform((days) => [...new Set(days)].sort((left, right) => left - right)),
  }),
])

export const conditionSchema = z.discriminatedUnion('field', [
  z.object({
    field: z.literal('weekday'),
    in: z
      .array(z.number().int(automationMessages.weekdayInvalid).min(0, automationMessages.weekdayInvalid).max(6, automationMessages.weekdayInvalid))
      .min(1, automationMessages.weekdaysRequired)
      .max(7, automationMessages.weekdayInvalid)
      .transform((days) => [...new Set(days)].sort((left, right) => left - right)),
  }),
  z
    .object({
      field: z.literal('hour_range'),
      from: z.string().regex(TIME, automationMessages.timeInvalid),
      to: z.string().regex(TIME, automationMessages.timeInvalid),
    })
    // Faixa invertida nunca casa: a regra pareceria ativa e jamais dispararia.
    .refine((value) => value.from < value.to, {
      message: automationMessages.hourRangeInvalid,
      path: ['to'],
    }),
])

export const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('notify_team'),
    roles: z
      .array(z.enum(MEMBERSHIP_ROLES, automationMessages.rolesRequired))
      .min(1, automationMessages.rolesRequired)
      .max(MEMBERSHIP_ROLES.length, automationMessages.rolesRequired)
      .transform((roles) => [...new Set(roles)]),
    message: z
      .string()
      .trim()
      .min(3, automationMessages.messageRequired)
      .max(280, automationMessages.messageTooLong),
  }),
  z.object({
    type: z.literal('create_task'),
    title: z
      .string()
      .trim()
      .min(3, automationMessages.taskTitleRequired)
      .max(160, automationMessages.taskTitleRequired),
    dueInDays: z
      .number()
      .int(automationMessages.dueInDaysInvalid)
      .min(0, automationMessages.dueInDaysInvalid)
      .max(90, automationMessages.dueInDaysInvalid),
  }),
])

const ruleShape = {
  name: z
    .string()
    .trim()
    .min(3, automationMessages.nameRequired)
    .max(120, automationMessages.nameTooLong),
  description: z
    .union([z.literal(''), z.string().trim().max(500, automationMessages.descriptionTooLong)])
    .transform((value) => value || null),
  triggerType: z.enum(WORKFLOW_TRIGGERS, automationMessages.triggerInvalid),
  triggerConfig: triggerConfigSchema,
  conditions: z.array(conditionSchema).max(MAX_CONDITIONS, automationMessages.conditionsTooMany),
  actions: z
    .array(actionSchema)
    .min(1, automationMessages.actionsRequired)
    .max(MAX_ACTIONS, automationMessages.actionsTooMany),
  isActive: z.boolean(),
}

/**
 * O gatilho e a configuração precisam combinar.
 *
 * Sem este `refine`, `{ triggerType: 'appointment_created', triggerConfig:
 * { kind: 'schedule' } }` seria aceito — uma linha que nem a tela nem o worker
 * futuro sabem interpretar.
 */
const matchesTrigger = (value: {
  triggerType: WorkflowTrigger
  triggerConfig: AutomationTriggerConfig
}) => triggerMatchesConfig(value.triggerType, value.triggerConfig)

export const createAutomationRuleSchema = z
  .object(ruleShape)
  .refine(matchesTrigger, {
    message: automationMessages.triggerConfigMismatch,
    path: ['triggerConfig'],
  })
export type CreateAutomationRuleInput = z.infer<typeof createAutomationRuleSchema>

export const updateAutomationRuleSchema = z
  .object({ ruleId: z.uuid(automationMessages.notFound), ...ruleShape })
  .refine(matchesTrigger, {
    message: automationMessages.triggerConfigMismatch,
    path: ['triggerConfig'],
  })
export type UpdateAutomationRuleInput = z.infer<typeof updateAutomationRuleSchema>

export const toggleAutomationRuleSchema = z.object({
  ruleId: z.uuid(automationMessages.notFound),
  isActive: z.boolean(),
})
export type ToggleAutomationRuleInput = z.infer<typeof toggleAutomationRuleSchema>

export const deleteAutomationRuleSchema = z.object({
  ruleId: z.uuid(automationMessages.notFound),
})
export type DeleteAutomationRuleInput = z.infer<typeof deleteAutomationRuleSchema>

export interface AutomationRuleDto {
  id: string
  name: string
  description: string | null
  triggerType: WorkflowTrigger
  triggerConfig: AutomationTriggerConfig
  conditions: readonly AutomationCondition[]
  actions: readonly AutomationAction[]
  isActive: boolean
  lastRunAt: string | null
  updatedAt: string
}

/**
 * O que a tela envia e a forma do DOMINIO, nao a inferida pelo Zod.
 *
 * As duas descrevem a mesma estrutura, mas a do dominio usa arrays `readonly` —
 * e e ela que a tela ja tem em maos ao editar uma regra vinda do banco. Usar a
 * inferida obrigaria a copiar cada lista so para tirar o `readonly`, o que nao
 * protege nada: quem valida de verdade e o schema, na action.
 */
export type AutomationRuleFormValues = NewAutomationRuleData
