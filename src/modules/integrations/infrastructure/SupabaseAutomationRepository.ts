import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, Json } from '@/lib/supabase/database.types'

import type { AutomationRuleDetail, NewAutomationRuleData } from '../domain/Automation'
import {
  AutomationRepositoryError,
  type AutomationRepository,
} from '../domain/AutomationRepository'
import {
  actionSchema,
  conditionSchema,
  triggerConfigSchema,
} from '../schemas/automation.schema'

type Client = SupabaseClient<Database>

const RULE_SELECT =
  'id, clinic_id, name, description, trigger_type, trigger_config, conditions, actions, is_active, last_run_at, updated_at'

const RULE_CAP = 100

/**
 * O UPDATE alcanca so o que o formulario define.
 *
 * `last_run_at` fica de fora de proposito: quem escreve essa coluna e o
 * executor, e a tela nao pode fingir que algo rodou.
 */
type WorkflowUpdate = Database['public']['Tables']['workflows']['Update']

interface WorkflowRow {
  id: string
  name: string
  description: string | null
  trigger_type: AutomationRuleDetail['triggerType']
  trigger_config: Json
  conditions: Json
  actions: Json
  is_active: boolean
  last_run_at: string | null
  updated_at: string
}

/**
 * A leitura reconstrói o JSON pelo MESMO schema que a escrita usa.
 *
 * `trigger_config`, `conditions` e `actions` são `jsonb`, e o banco aceita
 * qualquer coisa neles. Linha gravada por fora da aplicação — script de
 * migração, console do Supabase, um worker futuro — pode ter forma que a tela
 * não conhece.
 *
 * `safeParse` decide o que fazer com isso: o que não casa é **descartado**, não
 * exibido cru. Mostrar estrutura desconhecida na tela seria mostrar ao usuário
 * algo que ele não pode editar sem quebrar, e renderizar JSON arbitrário vindo
 * do banco é como conteúdo estranho vira problema.
 */
function toRule(row: WorkflowRow): AutomationRuleDetail {
  const parsedConfig = triggerConfigSchema.safeParse(row.trigger_config)
  const conditions = Array.isArray(row.conditions) ? row.conditions : []
  const actions = Array.isArray(row.actions) ? row.actions : []

  return {
    id: row.id,
    name: row.name,
    description: row.description,
    triggerType: row.trigger_type,
    /*
     * Config ilegível cai em `event`, que é a única forma sem parâmetro nenhum.
     *
     * Chutar `{ kind: 'reminder', hoursBefore: 24 }` para um gatilho de
     * lembrete seria inventar um número que ninguém configurou — e ele
     * apareceria no formulário como se fosse a escolha da clínica. Melhor a
     * tela mostrar que a configuração não está lá.
     */
    triggerConfig: parsedConfig.success ? parsedConfig.data : { kind: 'event' },
    conditions: conditions.flatMap((entry) => {
      const parsed = conditionSchema.safeParse(entry)
      return parsed.success ? [parsed.data] : []
    }),
    actions: actions.flatMap((entry) => {
      const parsed = actionSchema.safeParse(entry)
      return parsed.success ? [parsed.data] : []
    }),
    isActive: row.is_active,
    lastRunAt: row.last_run_at ? new Date(row.last_run_at) : null,
    updatedAt: new Date(row.updated_at),
  }
}

/** O que vai para o banco sai do domínio já validado — nunca do formulário. */
function toPayload(data: NewAutomationRuleData) {
  return {
    name: data.name,
    description: data.description,
    trigger_type: data.triggerType,
    trigger_config: data.triggerConfig as unknown as Json,
    conditions: data.conditions as unknown as Json,
    actions: data.actions as unknown as Json,
    is_active: data.isActive,
  }
}

export class SupabaseAutomationRepository implements AutomationRepository {
  constructor(private readonly client: Client) {}

  async listRules(clinicId: string): Promise<AutomationRuleDetail[]> {
    const { data, error } = await this.client
      .from('workflows')
      .select(RULE_SELECT)
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false })
      .limit(RULE_CAP)

    if (error) throw toAutomationError(error)
    return (data ?? []).map((row) => toRule(row as unknown as WorkflowRow))
  }

  async createRule(
    clinicId: string,
    createdBy: string,
    data: NewAutomationRuleData,
  ): Promise<AutomationRuleDetail> {
    const { data: row, error } = await this.client
      .from('workflows')
      .insert({ clinic_id: clinicId, created_by: createdBy, ...toPayload(data) })
      .select(RULE_SELECT)
      .single()

    if (error) throw toAutomationError(error)
    if (!row) throw new AutomationRepositoryError('unexpected', 'insert sem retorno')
    return toRule(row as unknown as WorkflowRow)
  }

  async updateRule(
    clinicId: string,
    ruleId: string,
    data: NewAutomationRuleData,
  ): Promise<AutomationRuleDetail> {
    return this.patch(clinicId, ruleId, {
      ...toPayload(data),
      updated_at: new Date().toISOString(),
    })
  }

  async setActive(
    clinicId: string,
    ruleId: string,
    isActive: boolean,
  ): Promise<AutomationRuleDetail> {
    return this.patch(clinicId, ruleId, {
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
  }

  async deleteRule(clinicId: string, ruleId: string): Promise<void> {
    const { data, error } = await this.client
      .from('workflows')
      .delete()
      .eq('clinic_id', clinicId)
      .eq('id', ruleId)
      .select('id')
      .maybeSingle()

    if (error) throw toAutomationError(error)
    if (data) return

    // Mesma leitura de sempre: zero linhas não diz sozinho se a regra sumiu ou
    // se a policy de DELETE não existe.
    if (await this.exists(clinicId, ruleId)) {
      throw new AutomationRepositoryError(
        'write-forbidden',
        'a regra é legível mas a exclusão foi recusada',
      )
    }
    throw new AutomationRepositoryError('not-found', 'regra indisponível nesta clínica')
  }

  private async patch(
    clinicId: string,
    ruleId: string,
    patch: WorkflowUpdate,
  ): Promise<AutomationRuleDetail> {
    const { data, error } = await this.client
      .from('workflows')
      .update(patch)
      .eq('clinic_id', clinicId)
      .eq('id', ruleId)
      .select(RULE_SELECT)
      .maybeSingle()

    if (error) throw toAutomationError(error)
    if (data) return toRule(data as unknown as WorkflowRow)

    if (await this.exists(clinicId, ruleId)) {
      throw new AutomationRepositoryError(
        'write-forbidden',
        'a regra é legível mas a escrita foi recusada',
      )
    }
    throw new AutomationRepositoryError('not-found', 'regra indisponível nesta clínica')
  }

  private async exists(clinicId: string, ruleId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from('workflows')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('id', ruleId)
      .maybeSingle()

    if (error) throw toAutomationError(error)
    return data !== null
  }
}

function toAutomationError(error: {
  code?: string | null
  message?: string | null
}): AutomationRepositoryError {
  const code = error.code ?? undefined
  const message = error.message ?? ''

  if (code === '42501' || code === 'PGRST301') {
    return new AutomationRepositoryError('forbidden', 'recusado pela policy', code)
  }
  /*
   * `workflow_runs` referencia `workflows`. Enquanto não há executor não existe
   * run nenhuma, mas o dia em que existir, excluir uma regra com histórico
   * apagaria a evidência do que rodou — o banco recusa, e a tela manda desativar.
   */
  if (code === '23503') {
    return new AutomationRepositoryError('has-runs', 'há execuções registradas', code)
  }
  if (/fetch|network|timeout|econnrefused/i.test(message)) {
    return new AutomationRepositoryError('unavailable', 'falha de conexão', code)
  }
  return new AutomationRepositoryError('unexpected', 'falha ao acessar automações', code)
}
