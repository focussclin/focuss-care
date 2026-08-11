import { describe, expect, it, vi } from 'vitest'

import { SupabaseProfessionalRepository } from './SupabaseProfessionalRepository'

/**
 * Contrato do cadastro de profissionais.
 *
 * Sem banco e sem rede — o cliente é um duplo. `professionals` já existe no
 * schema aplicado; esta fatia não cria migration.
 *
 * O que se prova: escopo de tenant, o filtro de exclusão lógica, que
 * `agenda_color` nunca é escrita, e que o vínculo com usuário é conferido
 * contra `memberships` desta clínica — não contra `profiles`.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const OTHER_CLINIC = 'b4b7c0f2-1f6a-4a55-9d5a-2f7b1c3d4e5f'
const PROFESSIONAL = '11111111-1111-4111-8111-111111111111'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'

interface RecordedCall {
  table: string
  method: string
  args: unknown[]
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: PROFESSIONAL,
    user_id: USER,
    display_name: 'Dra. Helena Alves',
    council_type: 'CRM',
    council_number: '12345',
    council_state: 'SP',
    specialties: ['Clínica geral'],
    default_slot_minutes: 30,
    is_active: true,
    ...overrides,
  }
}

const data = {
  displayName: 'Dra. Helena Alves',
  councilType: 'CRM' as const,
  councilNumber: '12345',
  councilState: 'SP',
  specialties: ['Clínica geral'],
  agendaColor: null,
  defaultSlotMinutes: 30,
  userId: USER,
}

interface FakeOptions {
  rows?: unknown[]
  singles?: unknown[]
  error?: { code?: string | null; message?: string | null }
}

function repository(options: FakeOptions = {}) {
  const calls: RecordedCall[] = []
  const singles = [...(options.singles ?? [])]

  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {}

    const chain =
      (method: string) =>
      (...args: unknown[]) => {
        calls.push({ table, method, args })
        return builder
      }

    for (const method of ['select', 'eq', 'is', 'order', 'limit', 'insert', 'update']) {
      builder[method] = chain(method)
    }

    const single = async () => ({
      data: options.error ? null : (singles.shift() ?? null),
      error: options.error ?? null,
    })

    builder.single = async () => {
      calls.push({ table, method: 'single', args: [] })
      return single()
    }
    builder.maybeSingle = async () => {
      calls.push({ table, method: 'maybeSingle', args: [] })
      return single()
    }
    builder.then = (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) =>
      Promise.resolve({
        data: options.error ? null : (options.rows ?? []),
        error: options.error ?? null,
      }).then(onFulfilled, onRejected)

    return builder
  })

  return {
    calls,
    tablesTouched: () => [...new Set(calls.map((call) => call.table))],
    argsOf: (method: string) =>
      calls.filter((call) => call.method === method).map((call) => call.args),
    subject: new SupabaseProfessionalRepository({ from } as never),
  }
}

describe('leitura', () => {
  it('filtra pela clínica recebida', async () => {
    const { subject, argsOf } = repository({ rows: [row()] })

    await subject.list(OTHER_CLINIC)

    expect(argsOf('eq')).toContainEqual(['clinic_id', OTHER_CLINIC])
  })

  it('esconde quem foi apagado logicamente', async () => {
    /*
     * A aplicação não apaga profissional, mas linhas removidas por fora
     * existem — e trazê-las de volta reporia na agenda quem já saiu. Agenda,
     * equipe e assinatura filtram o mesmo `deleted_at`.
     */
    const { subject, argsOf } = repository({ rows: [row()] })

    await subject.list(CLINIC)

    expect(argsOf('is')).toContainEqual(['deleted_at', null])
  })

  it('traz inativos junto — a tela precisa deles para reativar', async () => {
    const { subject, argsOf } = repository({ rows: [row({ is_active: false })] })

    const [professional] = await subject.list(CLINIC)

    expect(argsOf('eq')).not.toContainEqual(['is_active', true])
    expect(professional.isActive).toBe(false)
  })

  it('especialidade nula vira lista vazia', async () => {
    const { subject } = repository({ rows: [row({ specialties: null })] })

    const [professional] = await subject.list(CLINIC)

    expect(professional.specialties).toEqual([])
  })
})

/**
 * `agenda_color` não é lida nem escrita: nenhuma tela a usa, e o formato — hexadecimal,
 * token do tema, nome CSS — não está declarado em lugar nenhum.
 */
describe('a cor de agenda fica de fora', () => {
  it('fica fora do insert', async () => {
    const { subject, argsOf } = repository({ singles: [row()] })

    await subject.create(CLINIC, data)

    expect((argsOf('insert')[0][0] as Record<string, unknown>).agenda_color).toBeUndefined()
  })
})

describe('criação', () => {
  it('o `clinic_id` vem do parâmetro, nunca do payload', async () => {
    const { subject, argsOf } = repository({ singles: [row()] })

    await subject.create(CLINIC, data)

    expect(argsOf('insert')[0][0]).toMatchObject({
      clinic_id: CLINIC,
      display_name: 'Dra. Helena Alves',
      is_active: true,
    })
  })

  it('o profissional nasce ativo', async () => {
    // Cadastrar alguém que não aparece na agenda seria trabalho sem efeito.
    const { subject, argsOf } = repository({ singles: [row()] })

    await subject.create(CLINIC, data)

    expect((argsOf('insert')[0][0] as Record<string, unknown>).is_active).toBe(true)
  })
})

/**
 * A guarda que as FKs de coluna única não dão.
 *
 * `professionals.user_id` referencia `profiles.id`: o banco aceita qualquer
 * usuário existente, de qualquer clínica.
 */
describe('vínculo com usuário', () => {
  it('confere contra `memberships` desta clínica, e não contra `profiles`', async () => {
    const { subject, tablesTouched, argsOf } = repository({ singles: [{ id: 'm1' }] })

    await subject.userBelongsToClinic(CLINIC, USER)

    expect(tablesTouched()).toEqual(['memberships'])
    expect(argsOf('eq')).toContainEqual(['clinic_id', CLINIC])
    expect(argsOf('eq')).toContainEqual(['user_id', USER])
  })

  it('exige vínculo ATIVO', async () => {
    /*
     * Convite pendente ainda não é conta, e acesso revogado não deveria voltar
     * a assinar prontuário por um caminho lateral.
     */
    const { subject, argsOf } = repository({ singles: [{ id: 'm1' }] })

    await subject.userBelongsToClinic(CLINIC, USER)

    expect(argsOf('eq')).toContainEqual(['status', 'active'])
  })

  it('sem vínculo, devolve falso', async () => {
    const { subject } = repository({ singles: [null] })

    await expect(subject.userBelongsToClinic(CLINIC, USER)).resolves.toBe(false)
  })
})

describe('edição e ativação', () => {
  it('a atualização é escopada em clínica E id', async () => {
    const { subject, argsOf } = repository({ singles: [row()] })

    await subject.update(CLINIC, PROFESSIONAL, data)

    expect(argsOf('eq')).toContainEqual(['clinic_id', CLINIC])
    expect(argsOf('eq')).toContainEqual(['id', PROFESSIONAL])
  })

  it('desativar mexe só em `is_active`', async () => {
    /*
     * Reaproveitar o payload inteiro aqui apagaria conselho e especialidade de
     * quem foi apenas afastado.
     */
    const { subject, argsOf } = repository({ singles: [row({ is_active: false })] })

    await subject.setActive(CLINIC, PROFESSIONAL, false)

    const patch = argsOf('update')[0][0] as Record<string, unknown>
    expect(patch.is_active).toBe(false)
    expect(patch).not.toHaveProperty('display_name')
  })
})

/**
 * Sem policy de UPDATE, o Postgres não devolve erro: zero linhas mudam, em
 * silêncio. A releitura é o que separa "a policy recusou" de "sumiu".
 */
describe('tradução das recusas do banco', () => {
  it('zero linhas com o profissional ainda legível é recusa de escrita', async () => {
    const { subject } = repository({ singles: [null, { id: PROFESSIONAL }] })

    await expect(subject.setActive(CLINIC, PROFESSIONAL, false)).rejects.toMatchObject({
      reason: 'write-forbidden',
    })
  })

  it('zero linhas com o profissional ausente é not-found', async () => {
    const { subject } = repository({ singles: [null, null] })

    await expect(subject.setActive(CLINIC, PROFESSIONAL, false)).rejects.toMatchObject({
      reason: 'not-found',
    })
  })

  it('recusa da policy é forbidden', async () => {
    const { subject } = repository({ error: { code: '42501' } })

    await expect(subject.list(CLINIC)).rejects.toMatchObject({ reason: 'forbidden' })
  })

  it('índice único vira vínculo já usado', async () => {
    // O mesmo usuário em dois profissionais deixaria
    // `current_professional_id()` sem saber qual devolver.
    const { subject } = repository({ error: { code: '23505' } })

    await expect(subject.create(CLINIC, data)).rejects.toMatchObject({
      reason: 'user-already-linked',
    })
  })

  it('queda de rede é retentável', async () => {
    const { subject } = repository({ error: { message: 'fetch failed' } })

    await expect(subject.list(CLINIC)).rejects.toMatchObject({ reason: 'unavailable' })
  })
})
