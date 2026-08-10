import { describe, expect, it, vi } from 'vitest'

import { SupabaseAuditLogRepository } from './SupabaseAuditLogRepository'

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'

interface Call {
  method: string
  args: unknown[]
}

function row(id: number) {
  return {
    id,
    action: 'patient.updated',
    entity_type: 'patient',
    entity_id: '9019956f-bdd8-4d61-868d-09b02332dad0',
    actor_role: 'admin',
    occurred_at: '2026-08-08T12:00:00.000Z',
  }
}

function fakeClient(rows: unknown[]) {
  const calls: Call[] = []
  const from = vi.fn(() => {
    const query: Record<string, unknown> = {}

    for (const method of ['select', 'eq', 'order', 'range']) {
      query[method] = (...args: unknown[]) => {
        calls.push({ method, args })
        return query
      }
    }

    query.then = (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected)

    return query
  })

  return { calls, client: { from } as never }
}

describe('SupabaseAuditLogRepository', () => {
  it('filtra o tenant, aplica filtros e não seleciona dados de rede ou metadados', async () => {
    const fake = fakeClient([row(10)])

    const page = await new SupabaseAuditLogRepository(fake.client).list(CLINIC, {
      action: 'patient.updated',
      entityType: 'patient',
      limit: 50,
      offset: 0,
    })

    expect(page.items[0]).toMatchObject({
      id: 10,
      action: 'patient.updated',
      entityType: 'patient',
      actorRole: 'admin',
    })
    expect(fake.calls).toContainEqual({ method: 'eq', args: ['clinic_id', CLINIC] })
    expect(fake.calls).toContainEqual({
      method: 'eq',
      args: ['action', 'patient.updated'],
    })
    expect(fake.calls).toContainEqual({ method: 'eq', args: ['entity_type', 'patient'] })
    expect(fake.calls).toContainEqual({ method: 'range', args: [0, 50] })

    const selected = fake.calls.find((call) => call.method === 'select')?.args[0] as string
    for (const forbidden of ['ip', 'user_agent', 'before', 'after']) {
      expect(selected).not.toContain(forbidden)
    }
  })

  it('indica próxima página sem aumentar o payload exibido', async () => {
    const fake = fakeClient(Array.from({ length: 51 }, (_, index) => row(index + 1)))

    const page = await new SupabaseAuditLogRepository(fake.client).list(CLINIC, {
      action: null,
      entityType: null,
      limit: 50,
      offset: 50,
    })

    expect(page.items).toHaveLength(50)
    expect(page.hasMore).toBe(true)
    expect(fake.calls).toContainEqual({ method: 'eq', args: ['clinic_id', CLINIC] })
  })
})
