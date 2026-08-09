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
  created?: unknown
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
      'insert',
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

    query.single = async () => ({
      data: options.created ?? row(),
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

it('cria um aviso somente para a clÃ­nica e o usuÃ¡rio do contexto', async () => {
  const fake = fakeClient({ created: row({ kind: 'appointment.created' }) })
  const repository = new SupabaseNotificationRepository(fake.client)

  const notification = await repository.createForUser(CLINIC, USER, {
    kind: 'appointment.created',
    title: 'Agendamento criado',
    body: 'Maria Souza â€¢ 09/08/2026, 10:00',
    link: '/agenda',
  })

  expect(notification.kind).toBe('appointment.created')
  expect(fake.calls).toContainEqual({
    method: 'insert',
    args: [
      {
        clinic_id: CLINIC,
        user_id: USER,
        kind: 'appointment.created',
        title: 'Agendamento criado',
        body: 'Maria Souza â€¢ 09/08/2026, 10:00',
        link: '/agenda',
      },
    ],
  })
})

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

  it('marca em lote somente avisos não lidos do tenant e usuário', async () => {
    const fake = fakeClient({
      rows: [row(), row({ id: '22222222-2222-4222-8222-222222222222' })],
    })

    const count = await new SupabaseNotificationRepository(fake.client).markAllRead(
      CLINIC,
      USER,
    )

    expect(count).toBe(2)
    expect(fake.calls).toContainEqual({ method: 'eq', args: ['clinic_id', CLINIC] })
    expect(fake.calls).toContainEqual({ method: 'eq', args: ['user_id', USER] })
    expect(fake.calls).toContainEqual({ method: 'is', args: ['read_at', null] })
  })
})
