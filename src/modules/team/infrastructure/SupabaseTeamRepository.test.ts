import { describe, expect, it, vi } from 'vitest'

import { SupabaseTeamRepository } from './SupabaseTeamRepository'

/**
 * Contrato da equipe (S-01).
 *
 * O que este arquivo protege são as duas recusas que impedem a clínica de ficar
 * inoperante — ninguém se tranca para fora, e a clínica nunca fica sem dono — e
 * a regra de que revogar **não apaga**.
 *
 * As três só aparecem em situações raras (o último owner saindo, alguém
 * clicando no próprio nome), que é exatamente o tipo de coisa que ninguém testa
 * a mão antes de ir para produção.
 *
 * Sem banco e sem rede. Tenancy real continua sendo pgTAP (R1).
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const ACTOR = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const OTHER_USER = '55555555-5555-4555-8555-555555555555'
const MEMBERSHIP = '9019956f-bdd8-4d61-868d-09b02332dad0'

interface RecordedCall {
  query: number
  table: string
  method: string
  args: unknown[]
}

function memberRow(overrides: Record<string, unknown> = {}) {
  return {
    id: MEMBERSHIP,
    user_id: OTHER_USER,
    role: 'professional',
    status: 'active',
    accepted_at: '2026-02-01T12:00:00.000Z',
    created_at: '2026-02-01T12:00:00.000Z',
    profiles: { full_name: 'Dra. Helena', email: 'helena@clinica.com' },
    ...overrides,
  }
}

function createFakeClient(results: {
  /** Linha devolvida pela checagem `requireMembership`. */
  target?: unknown
  /** Quantos OUTROS owners ativos existem. */
  otherOwners?: number
  updated?: unknown
}) {
  const calls: RecordedCall[] = []
  let queryIndex = -1
  let maybeSingleCount = 0

  const from = vi.fn((table: string) => {
    queryIndex += 1
    const index = queryIndex

    const record = (method: string, args: unknown[]) => {
      calls.push({ query: index, table, method, args })
    }

    const query: Record<string, unknown> = {}

    for (const method of ['select', 'eq', 'neq', 'is', 'gt', 'order', 'update', 'insert', 'delete']) {
      query[method] = (...args: unknown[]) => {
        record(method, args)
        return query
      }
    }

    query.maybeSingle = async () => {
      record('maybeSingle', [])
      maybeSingleCount += 1

      // 1a chamada: requireMembership. 2a: a linha atualizada.
      if (maybeSingleCount === 1) {
        return {
          data: 'target' in results ? results.target : memberRow(),
          error: null,
        }
      }

      return {
        data: 'updated' in results ? results.updated : memberRow(),
        error: null,
      }
    }

    query.then = (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => {
      // A contagem de owners usa `head: true`, que resolve como `{ count }`.
      const isOwnerCount = calls.some(
        (call) =>
          call.query === index &&
          call.method === 'eq' &&
          call.args[0] === 'role' &&
          call.args[1] === 'owner',
      )

      const payload = isOwnerCount
        ? { data: null, count: results.otherOwners ?? 1, error: null }
        : { data: [], count: null, error: null }

      return Promise.resolve(payload).then(onFulfilled, onRejected)
    }

    return query
  })

  return {
    calls,
    client: { from } as never,
    ofTable: (table: string) => calls.filter((call) => call.table === table),
  }
}

describe('revoke', () => {
  it('recusa revogar o próprio acesso', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = createFakeClient({
      target: { user_id: ACTOR, role: 'admin' },
    })

    await expect(
      new SupabaseTeamRepository(fake.client).revoke(
        CLINIC,
        MEMBERSHIP,
        ACTOR,
      ),
    ).rejects.toMatchObject({ reason: 'self-revoke' })

    // Quem clica errado se trancaria para fora, e so outro admin poderia
    // trazer de volta — numa clinica de dois, isso e chamado de suporte.
    expect(
      fake.ofTable('memberships').some((call) => call.method === 'update'),
    ).toBe(false)

    spy.mockRestore()
  })

  it('recusa revogar o ÚLTIMO responsável ativo', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = createFakeClient({
      target: { user_id: OTHER_USER, role: 'owner' },
      otherOwners: 0,
    })

    await expect(
      new SupabaseTeamRepository(fake.client).revoke(
        CLINIC,
        MEMBERSHIP,
        ACTOR,
      ),
    ).rejects.toMatchObject({ reason: 'last-owner' })

    spy.mockRestore()
  })

  it('permite revogar um responsável quando há outro', async () => {
    const fake = createFakeClient({
      target: { user_id: OTHER_USER, role: 'owner' },
      otherOwners: 1,
      updated: memberRow({ role: 'owner', status: 'revoked' }),
    })

    const member = await new SupabaseTeamRepository(fake.client).revoke(
      CLINIC,
      MEMBERSHIP,
      ACTOR,
    )

    expect(member.status).toBe('revoked')
  })

  it('a contagem de responsáveis EXCLUI o próprio alvo', async () => {
    const fake = createFakeClient({
      target: { user_id: OTHER_USER, role: 'owner' },
      otherOwners: 1,
      updated: memberRow({ status: 'revoked' }),
    })

    await new SupabaseTeamRepository(fake.client).revoke(
      CLINIC,
      MEMBERSHIP,
      ACTOR,
    )

    // Perguntar "quantos owners ha?" e comparar com 1 daria o numero errado
    // no instante em que dois administradores agissem ao mesmo tempo.
    expect(fake.ofTable('memberships')).toContainEqual(
      expect.objectContaining({ method: 'neq', args: ['id', MEMBERSHIP] }),
    )
  })

  it('revoga SEM apagar, e não revoga duas vezes', async () => {
    const fake = createFakeClient({
      target: { user_id: OTHER_USER, role: 'professional' },
      updated: memberRow({ status: 'revoked' }),
    })

    await new SupabaseTeamRepository(fake.client).revoke(
      CLINIC,
      MEMBERSHIP,
      ACTOR,
    )

    const calls = fake.ofTable('memberships')

    // Quem teve acesso a dado de saude, e entre que datas, e pergunta que a
    // clinica precisa conseguir responder.
    expect(calls.some((call) => call.method === 'delete')).toBe(false)

    // Revogar duas vezes sobrescreveria a data da primeira.
    expect(calls).toContainEqual(
      expect.objectContaining({ method: 'neq', args: ['status', 'revoked'] }),
    )

    const update = calls.find((call) => call.method === 'update')
      ?.args[0] as Record<string, unknown>

    expect(update.status).toBe('revoked')
    expect(update.revoked_at).toBeTypeOf('string')
  })

  it('filtra sempre pela clínica ativa', async () => {
    const fake = createFakeClient({
      target: { user_id: OTHER_USER, role: 'professional' },
      updated: memberRow({ status: 'revoked' }),
    })

    await new SupabaseTeamRepository(fake.client).revoke(
      CLINIC,
      MEMBERSHIP,
      ACTOR,
    )

    expect(fake.ofTable('memberships')).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['clinic_id', CLINIC] }),
    )
  })
})

describe('changeRole', () => {
  it('recusa rebaixar o ÚLTIMO responsável', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = createFakeClient({
      target: { user_id: OTHER_USER, role: 'owner' },
      otherOwners: 0,
    })

    await expect(
      new SupabaseTeamRepository(fake.client).changeRole(
        CLINIC,
        MEMBERSHIP,
        'receptionist',
        'owner',
      ),
    ).rejects.toMatchObject({ reason: 'last-owner' })

    spy.mockRestore()
  })

  it('promover a responsável não passa pela checagem de último dono', async () => {
    const fake = createFakeClient({
      target: { user_id: OTHER_USER, role: 'professional' },
      otherOwners: 0,
      updated: memberRow({ role: 'owner' }),
    })

    const member = await new SupabaseTeamRepository(fake.client).changeRole(
      CLINIC,
      MEMBERSHIP,
      'owner',
      'owner',
    )

    // Promover AUMENTA o numero de donos: barrar aqui impediria justamente a
    // saida do problema que a regra do ultimo dono cria.
    expect(member.role).toBe('owner')
  })

  it('trocar o papel de quem não é responsável não conta donos', async () => {
    const fake = createFakeClient({
      target: { user_id: OTHER_USER, role: 'receptionist' },
      otherOwners: 0,
      updated: memberRow({ role: 'finance' }),
    })

    const member = await new SupabaseTeamRepository(fake.client).changeRole(
      CLINIC,
      MEMBERSHIP,
      'finance',
      'owner',
    )

    expect(member.role).toBe('finance')
  })

  it('admin nao consegue conceder owner — nem a si mesmo', async () => {
    /*
     * A escalada que isto fecha: `admin` tem `team.manage` e NAO tem
     * `record.read` — a matriz exclui `admin` de CLINICAL como controle de
     * LGPD. Sem esta recusa, ele chamava `changeRole` com o proprio vinculo,
     * virava `owner` e passava a ler o prontuario de todos. O controle era
     * contornavel exatamente por quem ele restringia.
     */
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = createFakeClient({
      target: { user_id: OTHER_USER, role: 'admin' },
      updated: memberRow({ role: 'owner' }),
    })

    await expect(
      new SupabaseTeamRepository(fake.client).changeRole(
        CLINIC,
        MEMBERSHIP,
        'owner',
        'admin',
      ),
    ).rejects.toMatchObject({ reason: 'role-escalation' })

    spy.mockRestore()
  })

  it('a recusa acontece ANTES de tocar o banco', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = createFakeClient({ target: { user_id: OTHER_USER, role: 'admin' } })

    await expect(
      new SupabaseTeamRepository(fake.client).changeRole(
        CLINIC,
        MEMBERSHIP,
        'owner',
        null,
      ),
    ).rejects.toMatchObject({ reason: 'role-escalation' })

    // Papel nulo (claims ainda sem o vinculo) tambem nao concede: falha fechada.
    expect(fake.calls.length).toBe(0)

    spy.mockRestore()
  })

  it.each(
    [['admin'], ['receptionist'], ['professional'], ['finance']] as const,
  )(
    'owner ainda concede %s',
    async (papel) => {
      const fake = createFakeClient({
        target: { user_id: OTHER_USER, role: 'receptionist' },
        updated: memberRow({ role: papel }),
      })

      const member = await new SupabaseTeamRepository(fake.client).changeRole(
        CLINIC,
        MEMBERSHIP,
        papel,
        'owner',
      )

      expect(member.role).toBe(papel)
    },
  )
  it('vínculo de outra clínica vira not-found', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = createFakeClient({ target: null })

    await expect(
      new SupabaseTeamRepository(fake.client).changeRole(
        CLINIC,
        MEMBERSHIP,
        'admin',
        'owner',
      ),
    ).rejects.toMatchObject({ reason: 'not-found' })

    spy.mockRestore()
  })
})

describe('convites pendentes', () => {
  it('nunca traz o token_hash para a aplicação', async () => {
    const fake = createFakeClient({})

    await new SupabaseTeamRepository(fake.client).listPendingInvitations(
      CLINIC,
    )

    const columns = fake
      .ofTable('invitations')
      .find((call) => call.method === 'select')?.args[0] as string

    // E o material de que um convite e feito: traze-lo para o servidor de
    // aplicacao, e dai possivelmente para um log, e risco sem contrapartida.
    expect(columns).not.toContain('token_hash')
    expect(columns).toContain('email')
  })

  it('só lista o que ainda está pendente', async () => {
    const fake = createFakeClient({})

    await new SupabaseTeamRepository(fake.client).listPendingInvitations(
      CLINIC,
    )

    const calls = fake.ofTable('invitations')

    expect(calls).toContainEqual(
      expect.objectContaining({ method: 'is', args: ['accepted_at', null] }),
    )
    expect(calls).toContainEqual(
      expect.objectContaining({ method: 'is', args: ['revoked_at', null] }),
    )
  })
})

describe('emissão de convites', () => {
  it('usa a RPC do banco e recebe o token cru uma única vez', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: 'a'.repeat(64),
      error: null,
    })

    const invitation = await new SupabaseTeamRepository({ rpc } as never).createInvitation(
      CLINIC,
      ' Pessoa@Clinica.com ',
      'professional',
    )

    expect(rpc).toHaveBeenCalledWith('create_invitation', {
      p_email: ' Pessoa@Clinica.com ',
      p_role: 'professional',
    })
    expect(invitation.token).toBe('a'.repeat(64))
    expect(invitation.expiresAt.getTime()).toBeGreaterThan(Date.now())
  })

  it('não aceita retorno vazio da RPC como convite válido', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null })

    await expect(
      new SupabaseTeamRepository({ rpc } as never).createInvitation(
        CLINIC,
        'pessoa@clinica.com',
        'professional',
      ),
    ).rejects.toMatchObject({ reason: 'unexpected' })
  })
})
