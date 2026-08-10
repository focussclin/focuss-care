import { describe, expect, it, vi } from 'vitest'

import { isFormRepositoryError } from '../domain/FormRepositoryError'
import { SupabaseFormRepository } from './SupabaseFormRepository'

/**
 * Contrato do repositório de formulários.
 *
 * O fake grava a cadeia de chamadas do supabase-js. **Nenhuma chamada de
 * rede.** Isolamento real continua sendo pgTAP (R1); o que se afirma aqui é o
 * que a aplicação envia e como traduz cada recusa.
 *
 * O grupo que mais importa é o da **versão**. Até 10/08/2026
 * `clinic_forms.version` existia na migration, aparecia na entidade e no DTO, e
 * nada a escrevia: ficava em 1 para sempre, e a tela mostrava o número como se
 * ele significasse alguma coisa.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const OTHER_CLINIC = 'ffffffff-0000-4000-8000-00000000ffff'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const FORM = '9019956f-bdd8-4d61-868d-09b02332dad0'

interface RecordedCall {
  method: string
  args: unknown[]
}

function formRow(overrides: Record<string, unknown> = {}) {
  return {
    id: FORM,
    clinic_id: CLINIC,
    name: 'Anamnese inicial',
    description: null,
    form_type: 'anamnesis',
    status: 'draft',
    fields: [
      {
        id: 'f1',
        label: 'Alergias',
        type: 'text',
        required: true,
        helpText: null,
        options: [],
      },
    ],
    version: 3,
    created_by: USER,
    updated_by: USER,
    created_at: '2026-08-09T12:00:00.000Z',
    updated_at: '2026-08-09T12:00:00.000Z',
    ...overrides,
  }
}

function createFakeClient(
  options: {
    rows?: unknown[]
    row?: unknown
    error?: { code?: string; message?: string }
  } = {},
) {
  const calls: RecordedCall[] = []
  const query: Record<string, unknown> = {}

  for (const method of ['select', 'eq', 'order', 'limit', 'insert', 'update']) {
    query[method] = (...args: unknown[]) => {
      calls.push({ method, args })
      return query
    }
  }

  const single = async () => {
    calls.push({ method: 'single', args: [] })
    return {
      // `'row' in options` e nao `?? formRow()`: linha ausente — formulario de
      // outra clinica — e justamente o caso sob teste.
      data: options.error ? null : 'row' in options ? options.row : formRow(),
      error: options.error ?? null,
    }
  }

  query.single = single
  query.maybeSingle = single

  query.then = (
    onFulfilled: (value: unknown) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) =>
    Promise.resolve({
      data: options.error ? null : (options.rows ?? [formRow()]),
      error: options.error ?? null,
    }).then(onFulfilled, onRejected)

  return { calls, client: { from: vi.fn(() => query) } as never }
}

function subject(options: Parameters<typeof createFakeClient>[0] = {}) {
  const fake = createFakeClient(options)
  return { fake, repository: new SupabaseFormRepository(fake.client) }
}

function patchOf(calls: RecordedCall[]): Record<string, unknown> {
  return calls.find((call) => call.method === 'update')?.args[0] as Record<
    string,
    unknown
  >
}

describe('leitura', () => {
  it('prende a clínica na listagem', async () => {
    const { fake, repository } = subject({ rows: [] })

    await repository.list(CLINIC)

    expect(fake.calls).toContainEqual({ method: 'eq', args: ['clinic_id', CLINIC] })
    expect(fake.calls).not.toContainEqual({
      method: 'eq',
      args: ['clinic_id', OTHER_CLINIC],
    })
  })

  it('prende clínica E id no findById', async () => {
    const { fake, repository } = subject()

    await repository.findById(CLINIC, FORM)

    expect(fake.calls).toContainEqual({ method: 'eq', args: ['clinic_id', CLINIC] })
    expect(fake.calls).toContainEqual({ method: 'eq', args: ['id', FORM] })
  })

  it('formulário de outra clínica devolve null, e não erro', async () => {
    /*
     * `findById` é usado pela rota de resposta antes de renderizar. Lançar aqui
     * transformaria "não é desta clínica" em tela de erro, quando o certo é o
     * `notFound()` que a rota já faz.
     */
    const { repository } = subject({ row: null })

    await expect(repository.findById(CLINIC, FORM)).resolves.toBeNull()
  })

  it('mapeia a linha com os campos e a versão', async () => {
    const { repository } = subject({ rows: [formRow()] })

    const [form] = await repository.list(CLINIC)

    expect(form.name).toBe('Anamnese inicial')
    expect(form.version).toBe(3)
    expect(form.fields).toHaveLength(1)
  })

  it('clínica sem formulário devolve lista vazia', async () => {
    const { repository } = subject({ rows: [] })

    await expect(repository.list(CLINIC)).resolves.toEqual([])
  })
})

describe('criação', () => {
  it('grava o clinic_id e o autor do contexto', async () => {
    const { fake, repository } = subject()

    await repository.create(CLINIC, USER, {
      name: 'Consentimento',
      description: null,
      type: 'consent',
      status: 'draft',
      fields: [],
    })

    const values = fake.calls.find((call) => call.method === 'insert')
      ?.args[0] as Record<string, unknown>

    expect(values.clinic_id).toBe(CLINIC)
    expect(values.created_by).toBe(USER)
  })

  it('a versão começa em 1, e só a edição de campos a move', async () => {
    /*
     * O par do grupo "versão" abaixo. Nascer em 1 é o que dá sentido ao
     * incremento: sem um ponto de partida fixo, "versão 4" não diria quantas
     * vezes o questionário mudou desde que passou a coletar resposta.
     *
     * A SITUAÇÃO inicial, ao contrário, vem da entrada — criar já publicado é
     * legítimo, porque publicar depois exige a mesma permissão
     * (`clinic.settings`) e custaria dois cliques. Não há privilégio a mais
     * nesse caminho.
     */
    const { fake, repository } = subject()

    await repository.create(CLINIC, USER, {
      name: 'Consentimento',
      description: null,
      type: 'consent',
      status: 'draft',
      fields: [],
    })

    const values = fake.calls.find((call) => call.method === 'insert')
      ?.args[0] as Record<string, unknown>

    expect(values.version).toBe(1)
    expect(values.status).toBe('draft')
  })
})

describe('versão', () => {
  it('mudar os CAMPOS incrementa a versão', async () => {
    /*
     * `answers` é um objeto chaveado por id de campo. Uma resposta coletada
     * com as perguntas A e B é lida depois contra A e C — e sem a versão
     * ninguém sabe sob qual questionário aquela anamnese foi respondida.
     */
    const { fake, repository } = subject()

    await repository.update(CLINIC, FORM, USER, {
      fields: [
        {
          id: 'f1',
          label: 'Alergias e intolerâncias',
          type: 'text',
          required: true,
          helpText: null,
          options: [],
        },
      ],
    })

    expect(patchOf(fake.calls).version).toBe(4)
  })

  it('renomear NÃO incrementa a versão', async () => {
    // Trocar o título não invalida resposta nenhuma; incrementar aqui faria o
    // número perder o significado que ele acabou de ganhar.
    const { fake, repository } = subject()

    await repository.update(CLINIC, FORM, USER, { name: 'Anamnese revisada' })

    expect(patchOf(fake.calls)).not.toHaveProperty('version')
  })

  it('salvar os mesmos campos NÃO incrementa a versão', async () => {
    const { fake, repository } = subject()

    await repository.update(CLINIC, FORM, USER, {
      fields: [
        {
          id: 'f1',
          label: 'Alergias',
          type: 'text',
          required: true,
          helpText: null,
          options: [],
        },
      ],
    })

    expect(patchOf(fake.calls)).not.toHaveProperty('fields')
    expect(patchOf(fake.calls)).not.toHaveProperty('version')
  })

  it('publicar NÃO incrementa a versão', async () => {
    const { fake, repository } = subject()

    await repository.setStatus(CLINIC, FORM, USER, 'published')

    expect(patchOf(fake.calls).status).toBe('published')
    expect(patchOf(fake.calls)).not.toHaveProperty('version')
  })

  it('formulário inexistente não é versionado nem escrito', async () => {
    const { repository } = subject({ row: null })

    await expect(
      repository.update(CLINIC, FORM, USER, { fields: [] }),
    ).rejects.toSatisfy(
      (cause: unknown) =>
        isFormRepositoryError(cause) && cause.reason === 'not-found',
    )
  })
})

describe('escrita', () => {
  it('prende clínica E id ao atualizar', async () => {
    const { fake, repository } = subject()

    await repository.update(CLINIC, FORM, USER, { name: 'Novo nome' })

    expect(fake.calls).toContainEqual({ method: 'eq', args: ['clinic_id', CLINIC] })
    expect(fake.calls).toContainEqual({ method: 'eq', args: ['id', FORM] })
  })

  it('registra quem alterou', async () => {
    const { fake, repository } = subject()

    await repository.update(CLINIC, FORM, USER, { name: 'Novo nome' })

    expect(patchOf(fake.calls).updated_by).toBe(USER)
  })

  it('é update, e nunca delete', async () => {
    // Arquivar sai por `status`, que preserva as respostas já coletadas.
    const { fake, repository } = subject()

    await repository.setStatus(CLINIC, FORM, USER, 'archived')

    expect(fake.calls.some((call) => call.method === 'delete')).toBe(false)
  })
})

describe('tradução das recusas', () => {
  it('tabela ausente vira schema-not-ready', async () => {
    /*
     * A distinção que a tela depende: `schema-not-ready` declara a pendência da
     * migration; `unavailable` mandaria recarregar para sempre.
     */
    const { repository } = subject({ error: { code: '42P01' } })

    await expect(repository.list(CLINIC)).rejects.toSatisfy(
      (cause: unknown) =>
        isFormRepositoryError(cause) && cause.reason === 'schema-not-ready',
    )
  })

  it('recusa de policy vira forbidden', async () => {
    const { repository } = subject({ error: { code: '42501' } })

    await expect(repository.list(CLINIC)).rejects.toSatisfy(
      (cause: unknown) =>
        isFormRepositoryError(cause) && cause.reason === 'forbidden',
    )
  })
})
