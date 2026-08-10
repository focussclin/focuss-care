import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * A transição de estado de uma tarefa, pelo pipeline real.
 *
 * **Não há banco, nem rede, nem Next em runtime.** Sessão, cliente Supabase e
 * repositório são mocks — mesmo desenho de `searchPatients.action.test.ts`. O
 * que se verifica é o que o `createAction` decide sozinho, antes e depois do
 * handler:
 *
 *  - a clínica é a da SESSÃO, mesmo quando a entrada manda outra;
 *  - papel fora da lista não escreve;
 *  - a entrada é revalidada no servidor, e a tela não é a fronteira;
 *  - a recusa do banco vira mensagem em pt-BR, sem detalhe de Postgres;
 *  - o evento de auditoria descreve a transição.
 *
 * Escolhi `setTaskStatus` entre as três actions do módulo porque é a que a tela
 * dispara mais — concluir, reabrir e cancelar passam por ela — e a única cujo
 * efeito é irreversível na prática: quem cancela por engano não desfaz pela
 * interface.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const OTHER_CLINIC = 'b4b7c0f2-1f6a-4a55-9d5a-2f7b1c3d4e5f'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const TASK = '11111111-1111-4111-8111-111111111111'

const updateTag = vi.fn<(tag: string) => void>()
const revalidatePath = vi.fn<(path: string) => void>()

vi.mock('next/cache', () => ({
  updateTag: (tag: string) => updateTag(tag),
  revalidatePath: (path: string) => revalidatePath(path),
}))

vi.mock('next/server', () => ({
  after: (callback: () => unknown) => {
    void callback()
  },
}))

vi.mock('next/navigation', () => ({ unstable_rethrow: () => {} }))

const sessionState = vi.fn()
vi.mock('@/lib/auth/session', () => ({
  getSessionState: () => sessionState(),
}))

const supabase = { __fake: true }
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: async () => supabase,
}))

/*
 * O mock declara o PARÂMETRO de propósito.
 *
 * Sem ele, `vi.fn(async () => …)` tipa `mock.calls` como tupla vazia, e ler
 * `calls[0][0]` não compila — mesmo o teste passando em runtime. É o evento
 * que interessa aqui, então ele precisa existir no tipo.
 */
const recordAuditEvent = vi.fn(
  async (event: unknown): Promise<{ recorded: false; reason: string }> => {
    // O corpo ignora o evento; a assinatura o declara para que
    // `mock.calls[0][0]` exista no tipo. `void` deixa isso explícito em vez de
    // depender de um `_` que o lint reclama.
    void event
    return { recorded: false, reason: 'test' }
  },
)
vi.mock('@/lib/audit/audit-log', () => ({
  recordAuditEvent: (event: unknown) => recordAuditEvent(event),
}))

const setStatus = vi.fn()
vi.mock('../infrastructure/repository', () => ({
  taskRepositoryFor: () => ({ setStatus }),
}))

const { setTaskStatusAction } = await import('./setTaskStatus.action')
const { taskMessages } = await import('../schemas/task.schema')
const { TaskRepositoryError } = await import('../domain/TaskRepositoryError')

function activeSession(role: string | null = 'receptionist') {
  return {
    status: 'active' as const,
    user: { id: USER, email: null, displayName: 'Teste', avatarUrl: null },
    clinicId: CLINIC,
    clinicName: null,
    role,
  }
}

function task(overrides: Record<string, unknown> = {}) {
  return {
    id: TASK,
    title: 'Ligar para a paciente',
    notes: null,
    status: 'done',
    source: 'manual',
    priority: 3,
    dueAt: null,
    assignee: null,
    target: {
      patientId: null,
      patientName: null,
      appointmentId: null,
      invoiceId: null,
    },
    completedAt: new Date('2026-08-10T14:00:00.000Z'),
    createdAt: new Date('2026-08-09T12:00:00.000Z'),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionState.mockResolvedValue(activeSession())
  setStatus.mockResolvedValue(task())
})

describe('o que o servidor decide sozinho', () => {
  it('usa a clínica da SESSÃO, mesmo quando a entrada manda outra', async () => {
    /*
     * P3. O `clinicId` nem existe no schema, então a chave excedente é
     * descartada — e o repositório recebe o da sessão. É a garantia que impede
     * uma tarefa de outra clínica de ser fechada por quem sabe o id dela.
     */
    const result = await setTaskStatusAction({
      taskId: TASK,
      status: 'done',
      clinicId: OTHER_CLINIC,
    })

    expect(result.ok).toBe(true)
    expect(setStatus).toHaveBeenCalledWith(CLINIC, TASK, 'done')
  })

  it('papel fora da lista não escreve', async () => {
    /*
     * `finance` não tem `team.read` — a matriz diz que ele alcança cobrança, e
     * não a coordenação da equipe. A recusa acontece ANTES do handler: o
     * repositório não é chamado.
     */
    sessionState.mockResolvedValue(activeSession('finance'))

    const result = await setTaskStatusAction({ taskId: TASK, status: 'done' })

    expect(result.ok).toBe(false)
    expect(setStatus).not.toHaveBeenCalled()
  })

  it('sessão sem papel também não escreve', async () => {
    sessionState.mockResolvedValue(activeSession(null))

    const result = await setTaskStatusAction({ taskId: TASK, status: 'done' })

    expect(result.ok).toBe(false)
    expect(setStatus).not.toHaveBeenCalled()
  })
})

describe('a entrada é revalidada no servidor', () => {
  it('id que não é UUID é recusado', async () => {
    // A tela nunca manda isso; quem chama a Server Action direto, sim.
    const result = await setTaskStatusAction({ taskId: 'tarefa-1', status: 'done' })

    expect(result.ok).toBe(false)
    expect(setStatus).not.toHaveBeenCalled()
  })

  it('estado fora do enum do banco é recusado', async () => {
    /*
     * `status` vira a coluna `task_status`. Um valor fora do enum morreria no
     * Postgres com `22P02` — erro de driver, sem mensagem que ajude ninguém.
     */
    const result = await setTaskStatusAction({ taskId: TASK, status: 'arquivada' })

    expect(result.ok).toBe(false)
    expect(setStatus).not.toHaveBeenCalled()
  })

  it.each(['pending', 'in_progress', 'done', 'canceled'])(
    'aceita a transição para %s',
    async (status) => {
      const result = await setTaskStatusAction({ taskId: TASK, status })

      expect(result.ok).toBe(true)
      expect(setStatus).toHaveBeenCalledWith(CLINIC, TASK, status)
    },
  )
})

describe('recusa do banco', () => {
  it('migration pendente diz que é migration, e não "erro inesperado"', async () => {
    /*
     * A distinção que a tela depende: `schema-not-ready` faz a interface
     * declarar a pendência; "erro inesperado" mandaria a pessoa tentar de novo
     * para sempre, sobre um problema que nenhuma tentativa resolve.
     */
    setStatus.mockRejectedValue(
      new TaskRepositoryError('schema-not-ready', 'relação ausente'),
    )

    const result = await setTaskStatusAction({ taskId: TASK, status: 'done' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toBe(taskMessages.schemaPending)
  })

  it('tarefa de outra clínica vira "não está mais disponível"', async () => {
    setStatus.mockRejectedValue(
      new TaskRepositoryError('not-found', 'nenhuma linha'),
    )

    const result = await setTaskStatusAction({ taskId: TASK, status: 'done' })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.message).toBe(taskMessages.notFound)
  })

  it('nenhuma mensagem carrega detalhe de Postgres', async () => {
    setStatus.mockRejectedValue(
      new TaskRepositoryError(
        'unexpected',
        'null value in column "clinic_id" violates not-null constraint',
        '23502',
      ),
    )

    const result = await setTaskStatusAction({ taskId: TASK, status: 'done' })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.message).toBe(taskMessages.unexpected)
      expect(result.error.message).not.toMatch(/constraint|column|null value/i)
    }
  })
})

describe('auditoria', () => {
  function eventoRegistrado() {
    return recordAuditEvent.mock.calls[0][0] as unknown as {
      action: string
      entityId: string
      after: Record<string, unknown>
    }
  }

  it('registra a transição, e o ator não vem da entrada', async () => {
    /*
     * `recordAuditEvent` deriva ator, clínica e papel da sessão — o callback
     * só descreve O QUE aconteceu. É o que impede alguém de registrar a
     * própria ação em nome de outra pessoa.
     */
    await setTaskStatusAction({ taskId: TASK, status: 'done' })

    expect(recordAuditEvent).toHaveBeenCalledTimes(1)
    expect(eventoRegistrado().entityId).toBe(TASK)
    expect(eventoRegistrado().after).toMatchObject({ status: 'done' })
  })

  it.each([
    ['done', 'task.completed'],
    ['canceled', 'task.canceled'],
    ['pending', 'task.reopened'],
    ['in_progress', 'task.reopened'],
  ])('%s vira o evento %s', async (status, esperado) => {
    /*
     * Os três nomes são a parte que vale testar. Um `task.status_changed`
     * único obrigaria quem lê a trilha a abrir o `after` para saber se a
     * pessoa RESOLVEU ou decidiu NÃO FAZER — e as duas contam diferente em
     * qualquer leitura de produtividade da equipe.
     */
    await setTaskStatusAction({ taskId: TASK, status })

    expect(eventoRegistrado().action).toBe(esperado)
  })
})
