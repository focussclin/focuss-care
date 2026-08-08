import { describe, expect, it, vi } from 'vitest'

import { SupabaseNotificationRepository } from './SupabaseNotificationRepository'

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const NOTIFICATION = '9019956f-bdd8-4d61-868d-09b02332dad0'

interface Call {
  method: string
  args: unknown[]
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: NOTIFICATION,
    kind: 'appointment.confirmed',
    title: 'Consulta confirmada',
    body: 'A agenda foi atualizada.',
    link: '/agenda',
    read_at: null,
    created_at: '2026-08-08T12:00:00.000Z',
    ...overrides,
  }
}

function fakeClient(options: {
  rows?: unknown[]
  count?: number
  marked?: unknown
}) {
  const calls: Call[] = []
  const from = vi.fn(() => {
    const query: Record<string, unknown> = {}
    const isCountQuery = () =>
      calls.some(
        (call) => call.method === 'is' && call.args[0] === 'read_at',
      )

    for (const method of [
      'select',
      'eq',
      'order',
      'limit',
      'is',
      'update',
    ]) {
      query[method] = (...args: unknown[]) => {
        calls.push({ method, args })
        return query
      }
    }

    query.maybeSingle = async () => ({
      data: options.marked ?? null,
      error: null,
    })

    query.then = (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) =>
      Promise.resolve({
        data: options.rows ?? [],
        count: isCountQuery() ? options.count ?? 0 : null,
        error: null,
      }).then(onFulfilled, onRejected)

    return query
  })

  return { calls, client: { from } as never }
}

describe('repositório de notificações', () => {
  it('lista e conta somente notificações do usuário na clínica', async () => {
    const fake = fakeClient({ rows: [row()], count: 1 })
    const repository = new SupabaseNotificationRepository(fake.client)

    const [notifications, unread] = await Promise.all([
      repository.listForUser(CLINIC, USER, 20),
      repository.countUnread(CLINIC, USER),
    ])

    expect(notifications[0]).toMatchObject({
      id: NOTIFICATION,
      title: 'Consulta confirmada',
      readAt: null,
    })
    expect(unread).toBe(1)
    expect(fake.calls).toContainEqual({ method: 'eq', args: ['clinic_id', CLINIC] })
    expect(fake.calls).toContainEqual({ method: 'eq', args: ['user_id', USER] })
    expect(fake.calls).toContainEqual({ method: 'is', args: ['read_at', null] })
  })

  it('marca a linha do próprio usuário como lida', async () => {
    const fake = fakeClient({
      marked: row({ read_at: '2026-08-08T13:00:00.000Z' }),
    })

    const notification = await new SupabaseNotificationRepository(
      fake.client,
    ).markRead(CLINIC, USER, NOTIFICATION)

    expect(notification?.readAt).toEqual(new Date('2026-08-08T13:00:00.000Z'))
    expect(fake.calls).toContainEqual({ method: 'eq', args: ['id', NOTIFICATION] })
    expect(fake.calls).toContainEqual({ method: 'is', args: ['read_at', null] })
    expect(fake.calls.some((call) => call.method === 'update')).toBe(true)
  })
})
