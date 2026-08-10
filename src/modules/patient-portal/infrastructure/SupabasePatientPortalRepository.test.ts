import { describe, expect, it, vi } from 'vitest'

import { isPatientPortalRepositoryError } from '../domain/PatientPortalRepositoryError'
import { SupabasePatientPortalRepository } from './SupabasePatientPortalRepository'

/**
 * Contrato do adapter do portal.
 *
 * O fake grava as chamadas em vez de falar com o banco. **Nenhuma chamada de
 * rede.** Isolamento real continua sendo pgTAP (R1); o que se afirma aqui é o
 * contrato da aplicação — quais funções ela chama, com quais argumentos, e como
 * traduz cada recusa.
 *
 * A tradução de erro ocupa metade do arquivo de propósito. Cada razão leva a uma
 * AÇÃO diferente na tela do paciente — "peça um novo", "entre pelo login",
 * "fale com a recepção" —, e trocá-las manda a pessoa para o lugar errado numa
 * tela que ela abre uma vez na vida, sozinha.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const PATIENT = '11111111-1111-4111-8111-111111111111'
const TOKEN = 'a'.repeat(64)

interface RpcCall {
  fn: string
  args: unknown
}

function createFakeClient(options: {
  data?: unknown
  error?: { code?: string; message?: string }
  rows?: unknown[]
} = {}) {
  const rpcCalls: RpcCall[] = []
  const fromCalls: { method: string; args: unknown[] }[] = []

  const rpc = vi.fn(async (fn: string, args?: unknown) => {
    rpcCalls.push({ fn, args })
    return {
      data: options.error ? null : ('data' in options ? options.data : []),
      error: options.error ?? null,
    }
  })

  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'order', 'limit']) {
    builder[method] = (...args: unknown[]) => {
      fromCalls.push({ method, args })
      return builder
    }
  }
  builder.then = (
    onFulfilled: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) =>
    Promise.resolve({
      data: options.error ? null : (options.rows ?? []),
      error: options.error ?? null,
    }).then(onFulfilled, onRejected)

  const from = vi.fn(() => builder)

  return { rpcCalls, fromCalls, from, client: { rpc, from } as never }
}

function subject(options: Parameters<typeof createFakeClient>[0] = {}) {
  const fake = createFakeClient(options)
  return { fake, repository: new SupabasePatientPortalRepository(fake.client) }
}

describe('leitura do paciente', () => {
  it('o perfil sai de função, e não de `from(patients)`', async () => {
    /*
     * O ponto da fatia inteira. `patients` tem `admin_notes` — a anotação que a
     * recepção escreve sobre a pessoa — e RLS filtra linha, não coluna. Ler por
     * tabela deixaria o paciente pedir `select=*` ao PostgREST.
     */
    const { fake, repository } = subject({ data: [] })

    await repository.myProfiles()

    expect(fake.rpcCalls).toEqual([{ fn: 'portal_my_profile', args: undefined }])
    expect(fake.from).not.toHaveBeenCalled()
  })

  it('não envia clinicId nenhum — o recorte é do banco', async () => {
    /*
     * Nenhum método do lado do paciente recebe `clinicId`, e nenhum o manda: o
     * paciente não é membro, `current_clinic_id()` devolve null para ele, e o
     * recorte vem de `portal_patient_ids()` a partir de `auth.uid()`.
     *
     * Se um `clinic_id` fosse enviado daqui, ele viria do cliente — e escolher
     * o tenant seria do chamador.
     */
    const { fake, repository } = subject({ data: [] })

    await repository.myProfiles()
    await repository.myInvoices()

    const serializado = JSON.stringify(fake.rpcCalls)

    expect(serializado).not.toContain('clinic')
  })

  it('a agenda vai ao banco com o intervalo pedido', async () => {
    const { fake, repository } = subject({ data: [] })
    const from = new Date('2026-01-01T00:00:00.000Z')
    const to = new Date('2027-01-01T00:00:00.000Z')

    await repository.myAppointments(from, to)

    expect(fake.rpcCalls[0]).toEqual({
      fn: 'portal_my_appointments',
      args: { p_from: from.toISOString(), p_to: to.toISOString() },
    })
  })

  it('mapeia o perfil preferindo o nome social', async () => {
    // É como a pessoa quer ser chamada. O nome legal continua disponível para
    // os documentos, e não para o cabeçalho da tela.
    const { repository } = subject({
      data: [
        {
          patient_id: PATIENT,
          clinic_id: CLINIC,
          clinic_name: 'Clínica Aurora',
          full_name: 'Maria Aparecida Souza',
          social_name: 'Cida Souza',
          birth_date: '1980-03-02',
          email: 'cida@exemplo.com',
          phone: '11999990000',
        },
      ],
    })

    const [profile] = await repository.myProfiles()

    expect(profile.displayName).toBe('Cida Souza')
    expect(profile.legalName).toBe('Maria Aparecida Souza')
    expect(profile.birthDate).toEqual(new Date('1980-03-02'))
  })

  it('sem nome social, cai no nome legal', async () => {
    const { repository } = subject({
      data: [
        {
          patient_id: PATIENT,
          clinic_id: CLINIC,
          clinic_name: null,
          full_name: 'Ana Souza',
          social_name: '   ',
          birth_date: null,
          email: null,
          phone: null,
        },
      ],
    })

    const [profile] = await repository.myProfiles()

    expect(profile.displayName).toBe('Ana Souza')
  })

  it('conta sem vínculo devolve lista vazia, e não erro', async () => {
    /*
     * É o caso do membro da equipe que clicou no item do menu. Lançar aqui
     * faria a tela dizer "algo deu errado" para quem simplesmente não é
     * paciente daquela clínica.
     */
    const { repository } = subject({ data: [] })

    await expect(repository.myProfiles()).resolves.toEqual([])
  })

  it('cobrança cancelada não passa nem pela segunda barreira', async () => {
    /*
     * A função do banco já a exclui. Este filtro existe porque as duas pontas
     * podem divergir, e o custo é o paciente ver um valor que ninguém vai
     * cobrar.
     */
    const { repository } = subject({
      data: [
        {
          id: 'i1',
          patient_id: PATIENT,
          status: 'canceled',
          issue_date: null,
          due_date: null,
          total_cents: 5000,
          paid_cents: 0,
        },
        {
          id: 'i2',
          patient_id: PATIENT,
          status: 'issued',
          issue_date: '2026-08-01',
          due_date: '2026-08-15',
          total_cents: 20000,
          paid_cents: 5000,
        },
      ],
    })

    const invoices = await repository.myInvoices()

    expect(invoices.map((invoice) => invoice.id)).toEqual(['i2'])
  })
})

describe('convite', () => {
  it('a pré-visualização devolve not-found sem lançar', async () => {
    /*
     * Token inexistente é a resposta esperada de uma URL truncada no WhatsApp —
     * o caso mais comum de todos. Lançar faria a tela mostrar "algo deu errado"
     * para ele.
     */
    const { repository } = subject({ data: [] })

    const preview = await repository.previewInvite(TOKEN)

    expect(preview.status).toBe('not-found')
    expect(preview.maskedEmail).toBeNull()
  })

  it('a criação não manda clinic_id — a função resolve', async () => {
    const { fake, repository } = subject({
      data: [{ token: TOKEN, expires_at: '2026-08-17T00:00:00.000Z' }],
    })

    await repository.createInvite(PATIENT, 'ana@exemplo.com', 7)

    expect(fake.rpcCalls[0]).toEqual({
      fn: 'create_patient_portal_invite',
      args: {
        p_patient_id: PATIENT,
        p_email: 'ana@exemplo.com',
        p_expires_in_days: 7,
      },
    })
  })

  it('o histórico não seleciona o hash do token', async () => {
    const { fake, repository } = subject({ rows: [] })

    await repository.listInvites(CLINIC, PATIENT)

    const select = fake.fromCalls.find((call) => call.method === 'select')

    expect(String(select?.args[0])).not.toContain('token_hash')
    expect(String(select?.args[0])).not.toBe('*')
  })

  it('o histórico filtra por clínica E por paciente', async () => {
    const { fake, repository } = subject({ rows: [] })

    await repository.listInvites(CLINIC, PATIENT)

    expect(fake.fromCalls).toContainEqual({
      method: 'eq',
      args: ['clinic_id', CLINIC],
    })
    expect(fake.fromCalls).toContainEqual({
      method: 'eq',
      args: ['patient_id', PATIENT],
    })
  })

  it('o aceite devolve o id da conta criada', async () => {
    const { repository } = subject({ data: 'account-1' })

    await expect(repository.acceptInvite(TOKEN)).resolves.toBe('account-1')
  })
})

describe('tradução das recusas', () => {
  const cases = [
    ['EMAIL_MISMATCH', 'email-mismatch'],
    ['INVITE_EXPIRED', 'invite-expired'],
    ['INVITE_USED', 'invite-used'],
    ['INVITE_REVOKED', 'invite-revoked'],
    ['ALREADY_LINKED', 'already-linked'],
    ['NOT_AUTHENTICATED', 'not-authenticated'],
    ['INVITE_NOT_FOUND', 'not-found'],
  ] as const

  it.each(cases)('%s vira %s', async (message, reason) => {
    const { repository } = subject({ error: { code: '42501', message } })

    await expect(repository.acceptInvite(TOKEN)).rejects.toSatisfy(
      (cause: unknown) =>
        isPatientPortalRepositoryError(cause) && cause.reason === reason,
    )
  })

  it('a mensagem vence o código', async () => {
    /*
     * `42501` sozinho seria `forbidden` — "você não tem permissão", que manda a
     * pessoa falar com a clínica. `EMAIL_MISMATCH` no mesmo código significa
     * "entre com o outro e-mail", que ela resolve sozinha em dez segundos.
     */
    const { repository } = subject({
      error: { code: '42501', message: 'EMAIL_MISMATCH' },
    })

    await expect(repository.acceptInvite(TOKEN)).rejects.toSatisfy(
      (cause: unknown) =>
        isPatientPortalRepositoryError(cause) &&
        cause.reason === 'email-mismatch',
    )
  })

  it('função ausente é schema-not-ready, e não indisponibilidade', async () => {
    /*
     * A distinção que a tela depende: `schema-not-ready` significa "a migration
     * não foi aplicada" e a tela declara a pendência; `unavailable` significa
     * "tente de novo" e faria a pessoa recarregar para sempre.
     */
    for (const code of ['42883', 'PGRST202']) {
      const { repository } = subject({ error: { code } })

      await expect(repository.myProfiles()).rejects.toSatisfy(
        (cause: unknown) =>
          isPatientPortalRepositoryError(cause) &&
          cause.reason === 'schema-not-ready',
      )
    }
  })

  it('recusa de policy sem mensagem conhecida é forbidden', async () => {
    const { repository } = subject({ error: { code: '42501', message: '' } })

    await expect(repository.myProfiles()).rejects.toSatisfy(
      (cause: unknown) =>
        isPatientPortalRepositoryError(cause) && cause.reason === 'forbidden',
    )
  })
})
