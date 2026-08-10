import type { MembershipRole, WorkflowTrigger } from '@/lib/supabase/database.types'

/**
 * Regras de automação — o que a clínica cadastra, e nada além disso.
 *
 * # Nenhuma delas executa
 *
 * `workflows` guarda configuração para um serviço de execução que **não
 * existe**. Cadastrar uma regra aqui não dispara lembrete, mensagem nem tarefa;
 * a linha fica guardada esperando o worker. A tela diz isso em toda parte, e o
 * domínio não finge o contrário — não há campo de "próxima execução" nem
 * contador de disparos, porque seriam sempre zero.
 *
 * # Por que o vocabulário é fechado
 *
 * `trigger_config`, `conditions` e `actions` são colunas `jsonb`: o banco aceita
 * qualquer coisa. Guardar JSON livre vindo do formulário faria a tela virar um
 * canal para gravar estrutura arbitrária no tenant — e o dia em que o worker
 * existir, ele leria isso e agiria em cima. Um `actions` com um alvo inventado
 * seria um pedido de execução que ninguém revisou.
 *
 * Por isso cada um dos três tem forma fechada, validada por Zod antes de virar
 * `Json`, e reconstruída na leitura. O que não casa com a forma é recusado na
 * escrita e ignorado na leitura.
 *
 * # E por que só ações internas
 *
 * O vocabulário de ações cobre apenas efeitos que ficam DENTRO do produto —
 * notificar a equipe e abrir tarefa. Nada que saia da clínica (WhatsApp,
 * webhook, e-mail, IA) entra aqui, porque cada um desses depende de um adapter
 * externo que não existe. Oferecer a opção no formulário seria prometer um
 * envio que nunca vai acontecer.
 */

export const WORKFLOW_TRIGGERS = [
  'appointment_created',
  'appointment_confirmed',
  'appointment_reminder',
  'appointment_no_show',
  'encounter_finished',
  'invoice_issued',
  'invoice_overdue',
  'patient_birthday',
  'schedule',
] as const satisfies readonly WorkflowTrigger[]

/**
 * A configuração do gatilho depende do gatilho — e só dois têm o que
 * configurar.
 *
 * `appointment_reminder` precisa saber com quanta antecedência; `schedule`
 * precisa de horário e dias. Os outros sete disparam no evento e não têm
 * parâmetro nenhum: dar-lhes um objeto com campos vazios seria guardar
 * configuração que ninguém vai ler.
 */
export type AutomationTriggerConfig =
  | { kind: 'event' }
  | { kind: 'reminder'; hoursBefore: number }
  | { kind: 'schedule'; time: string; weekdays: readonly number[] }

export function triggerConfigKindFor(
  trigger: WorkflowTrigger,
): AutomationTriggerConfig['kind'] {
  if (trigger === 'appointment_reminder') return 'reminder'
  if (trigger === 'schedule') return 'schedule'
  return 'event'
}

/**
 * Condições restringem QUANDO a regra vale, e são independentes do gatilho.
 *
 * Só duas, ambas calculáveis a partir do relógio: dia da semana e faixa de
 * hora. Condições sobre o dado do evento (status da consulta, valor da fatura)
 * ficariam de fora porque cada gatilho carrega um payload diferente, e um campo
 * que não existe no payload viraria condição que nunca casa — regra que parece
 * ativa e nunca dispara.
 */
export type AutomationCondition =
  | { field: 'weekday'; in: readonly number[] }
  | { field: 'hour_range'; from: string; to: string }

/** Nenhuma ação sai da clínica. Ver o cabeçalho deste arquivo. */
export type AutomationAction =
  | { type: 'notify_team'; roles: readonly MembershipRole[]; message: string }
  | { type: 'create_task'; title: string; dueInDays: number }

export const AUTOMATION_ACTION_TYPES = ['notify_team', 'create_task'] as const

export interface AutomationRuleDetail {
  id: string
  name: string
  description: string | null
  triggerType: WorkflowTrigger
  triggerConfig: AutomationTriggerConfig
  conditions: readonly AutomationCondition[]
  actions: readonly AutomationAction[]
  isActive: boolean
  lastRunAt: Date | null
  updatedAt: Date
}

export interface NewAutomationRuleData {
  name: string
  description: string | null
  triggerType: WorkflowTrigger
  triggerConfig: AutomationTriggerConfig
  conditions: readonly AutomationCondition[]
  actions: readonly AutomationAction[]
  isActive: boolean
}

export const MAX_CONDITIONS = 5
export const MAX_ACTIONS = 5

/**
 * Uma regra sem ação não faz nada — nem quando o worker existir.
 *
 * Deixar salvar cria uma linha que a tela mostra como "ativa" e que jamais
 * produziria efeito: exatamente o interruptor falso que esta tela existe para
 * não ter.
 */
export function hasEffect(actions: readonly AutomationAction[]): boolean {
  return actions.length > 0
}

/**
 * O gatilho combina com a configuração recebida?
 *
 * Guardar `{ kind: 'schedule' }` sob `appointment_created` produziria uma linha
 * que nenhum leitor sabe interpretar — nem a tela, nem o worker futuro.
 */
export function triggerMatchesConfig(
  trigger: WorkflowTrigger,
  config: AutomationTriggerConfig,
): boolean {
  return triggerConfigKindFor(trigger) === config.kind
}
