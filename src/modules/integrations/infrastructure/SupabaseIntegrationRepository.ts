import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import type {
  AutomationRule,
  ChannelProvider,
  ConnectionState,
  IntegrationsOverview,
  WhatsappChannel,
} from '../domain/Integration'
import type { IntegrationRepository } from '../domain/IntegrationRepository'

type Client = SupabaseClient<Database>

/** Teto das listas. Automação de clínica se conta em dezenas, não em milhares. */
const ROW_CAP = 100

/**
 * Adapter das integrações.
 *
 * # Toda leitura aqui é tolerante a falha
 *
 * Nenhuma consulta lança. Uma tabela que a RLS recuse, ou que ainda não tenha
 * policy, devolve zero e um log — e a tela mostra "não conectado", que é a
 * resposta certa de qualquer forma.
 *
 * O motivo é específico deste módulo: `conversations`, `messages`,
 * `ai_usage_log` e `workflow_runs` **nunca foram escritas por nenhum código do
 * produto**, e as policies delas não foram verificadas (bloqueio B1). Derrubar
 * três telas por causa de uma contagem que hoje vale zero seria trocar um
 * problema inexistente por um real.
 */
export class SupabaseIntegrationRepository implements IntegrationRepository {
  constructor(private readonly client: Client) {}

  async overview(clinicId: string): Promise<IntegrationsOverview> {
    const [channel, conversations, messages, templates, rules, runs, ai] =
      await Promise.all([
        this.loadChannel(clinicId),
        this.countOf('conversations', clinicId),
        this.countOf('messages', clinicId),
        this.countOf('message_templates', clinicId),
        this.loadRules(clinicId),
        this.countOf('workflow_runs', clinicId),
        this.loadAi(clinicId),
      ])

    return {
      whatsapp: { channel, conversations, messages, templates },
      automations: { rules, runs },
      ai,
    }
  }

  private async loadChannel(clinicId: string): Promise<WhatsappChannel | null> {
    const { data, error } = await this.client
      .from('whatsapp_channels')
      .select(
        'id, display_name, phone_number, provider, is_active, connected_at',
      )
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('[integrations] loadChannel', { code: error.code ?? null })
      return null
    }

    if (!data) return null

    /*
     * Três estados, e não um booleano.
     *
     * Canal cadastrado mas desligado parece, de longe, igual a canal ausente —
     * e a ação para resolver é outra: um se ativa, o outro se cadastra.
     */
    const state: ConnectionState = !data.is_active
      ? 'inactive'
      : data.connected_at
        ? 'connected'
        : 'inactive'

    return {
      id: data.id,
      displayName: data.display_name,
      phoneNumber: data.phone_number,
      provider: data.provider as ChannelProvider,
      state,
      connectedAt: data.connected_at ? new Date(data.connected_at) : null,
    }
  }

  private async loadRules(clinicId: string): Promise<AutomationRule[]> {
    const { data, error } = await this.client
      .from('workflows')
      .select('id, name, description, trigger_type, is_active, last_run_at')
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false })
      .limit(ROW_CAP)

    if (error) {
      console.error('[integrations] loadRules', { code: error.code ?? null })
      return []
    }

    return (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      triggerType: row.trigger_type,
      isActive: row.is_active,
      lastRunAt: row.last_run_at ? new Date(row.last_run_at) : null,
    }))
  }

  private async loadAi(clinicId: string) {
    const [settings, conversations, requests] = await Promise.all([
      this.client
        .from('clinic_settings')
        .select('ai_enabled')
        .eq('clinic_id', clinicId)
        .maybeSingle(),
      this.countOf('ai_conversations', clinicId),
      this.countOf('ai_usage_log', clinicId),
    ])

    return {
      enabled: settings.data?.ai_enabled ?? false,
      conversations,
      requests,
    }
  }

  /**
   * Contagem tolerante.
   *
   * Devolve zero em qualquer falha, e registra o código no log do servidor. Ver
   * o JSDoc da classe para o motivo de a tolerância ser correta aqui e errada
   * em quase todo o resto do produto.
   */
  private async countOf(
    table:
      | 'conversations'
      | 'messages'
      | 'message_templates'
      | 'workflow_runs'
      | 'ai_conversations'
      | 'ai_usage_log',
    clinicId: string,
  ): Promise<number> {
    const { count, error } = await this.client
      .from(table)
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)

    if (error) {
      console.error(`[integrations] count ${table}`, {
        code: error.code ?? null,
      })
      return 0
    }

    return count ?? 0
  }
}
