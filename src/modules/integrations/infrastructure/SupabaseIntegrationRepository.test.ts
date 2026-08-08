import { describe, expect, it, vi } from 'vitest'

import { SupabaseIntegrationRepository } from './SupabaseIntegrationRepository'

/**
 * Contrato das integrações.
 *
 * O que este arquivo protege é a diferença entre "não configurado" e
 * "configurado e desligado" — de longe elas parecem iguais, e a ação para
 * resolver cada uma é outra. E protege a tolerância a falha, que aqui é
 * correta: derrubar três telas por causa de uma contagem que vale zero seria
 * trocar um problema inexistente por um real.
 *
 * Sem banco e sem rede.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'

interface RecordedCall {
  table: string
  method: string
  args: unknown[]
}

function createFakeClient(results: {
  channel?: unknown
  settings?: unknown
  rules?: unknown[]
  counts?: number
  failTables?: readonly string[]
}) {
  const calls: RecordedCall[] = []

  const from = vi.fn((table: string) => {
    const query: Record<string, unknown> = {}
    const failed = results.failTables?.includes(table) ?? false

    for (const method of ['select', 'eq', 'order', 'limit']) {
      query[method] = (...args: unknown[]) => {
        calls.push({ table, method, args })
        return query
      }
    }

    query.maybeSingle = async () => {
      if (failed) return { data: null, error: { code: '42501' } }

      if (table === 'whatsapp_channels') {
        return {
          data: 'channel' in results ? results.channel : null,
          error: null,
        }
      }

      if (table === 'clinic_settings') {
        return {
          data: 'settings' in results ? results.settings : { ai_enabled: false },
          error: null,
        }
      }

      return { data: null, error: null }
    }

    query.then = (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => {
      if (failed) {
        return Promise.resolve({
          data: null,
          count: null,
          error: { code: '42501' },
        }).then(onFulfilled, onRejected)
      }

      return Promise.resolve({
        data: table === 'workflows' ? (results.rules ?? []) : [],
        count: results.counts ?? 0,
        error: null,
      }).then(onFulfilled, onRejected)
    }

    return query
  })

  return {
    calls,
    client: { from } as never,
    ofTable: (table: string) => calls.filter((call) => call.table === table),
  }
}

describe('estado do canal', () => {
  it('sem canal cadastrado é AUSENTE', async () => {
    const fake = createFakeClient({})

    const overview = await new SupabaseIntegrationRepository(
      fake.client,
    ).overview(CLINIC)

    expect(overview.whatsapp.channel).toBeNull()
  })

  it('canal cadastrado e desligado é INATIVO, não ausente', async () => {
    const fake = createFakeClient({
      channel: {
        id: 'ch-1',
        display_name: 'Recepção',
        phone_number: '5511999998888',
        provider: 'evolution',
        is_active: false,
        connected_at: '2026-08-01T12:00:00.000Z',
      },
    })

    const overview = await new SupabaseIntegrationRepository(
      fake.client,
    ).overview(CLINIC)

    // De longe os dois estados parecem iguais, e a acao para resolver e outra:
    // um se ativa, o outro se cadastra.
    expect(overview.whatsapp.channel?.state).toBe('inactive')
  })

  it('canal ativo SEM data de conexão ainda não está conectado', async () => {
    const fake = createFakeClient({
      channel: {
        id: 'ch-1',
        display_name: 'Recepção',
        phone_number: '5511999998888',
        provider: 'evolution',
        is_active: true,
        connected_at: null,
      },
    })

    const overview = await new SupabaseIntegrationRepository(
      fake.client,
    ).overview(CLINIC)

    // `is_active` e intencao; `connected_at` e fato. Sem o segundo, dizer
    // "conectado" prometeria um envio que ninguem verificou.
    expect(overview.whatsapp.channel?.state).toBe('inactive')
  })

  it('ativo e com data de conexão é CONECTADO', async () => {
    const fake = createFakeClient({
      channel: {
        id: 'ch-1',
        display_name: 'Recepção',
        phone_number: '5511999998888',
        provider: 'evolution',
        is_active: true,
        connected_at: '2026-08-01T12:00:00.000Z',
      },
    })

    const overview = await new SupabaseIntegrationRepository(
      fake.client,
    ).overview(CLINIC)

    expect(overview.whatsapp.channel?.state).toBe('connected')
  })
})

describe('tolerância a falha', () => {
  it('tabela recusada pela RLS devolve zero, e não derruba a tela', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = createFakeClient({
      failTables: ['conversations', 'messages', 'workflows', 'ai_usage_log'],
      counts: 7,
    })

    const overview = await new SupabaseIntegrationRepository(
      fake.client,
    ).overview(CLINIC)

    /*
     * `conversations`, `messages`, `workflow_runs` e `ai_usage_log` nunca foram
     * escritas por nenhum codigo do produto, e suas policies nao foram
     * verificadas (B1). A resposta certa continua sendo "nao conectado".
     */
    expect(overview.whatsapp.conversations).toBe(0)
    expect(overview.whatsapp.messages).toBe(0)
    expect(overview.automations.rules).toEqual([])
    expect(overview.ai.requests).toBe(0)

    spy.mockRestore()
  })

  it('filtra sempre pela clínica ativa', async () => {
    const fake = createFakeClient({})

    await new SupabaseIntegrationRepository(fake.client).overview(CLINIC)

    for (const table of ['whatsapp_channels', 'workflows', 'conversations']) {
      expect(fake.ofTable(table)).toContainEqual(
        expect.objectContaining({ method: 'eq', args: ['clinic_id', CLINIC] }),
      )
    }
  })
})

describe('automações', () => {
  it('traz as regras do banco, sem inventar execução', async () => {
    const fake = createFakeClient({
      rules: [
        {
          id: 'wf-1',
          name: 'Lembrete de consulta',
          description: null,
          trigger_type: 'appointment_confirmed',
          is_active: true,
          last_run_at: null,
        },
      ],
    })

    const overview = await new SupabaseIntegrationRepository(
      fake.client,
    ).overview(CLINIC)

    expect(overview.automations.rules).toHaveLength(1)
    // "Ativa" no banco nao significa que dispara: nao ha executor.
    expect(overview.automations.rules[0].lastRunAt).toBeNull()
  })
})
