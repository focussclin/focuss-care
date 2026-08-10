import { describe, expect, it, vi } from 'vitest'

import { SupabaseAllergyRepository } from './SupabaseAllergyRepository'

/**
 * Contrato das alergias.
 *
 * Sem banco e sem rede — o cliente é um duplo. `allergies` já existe no banco
 * aplicado, então não há caso de migration pendente: o que se prova é o escopo
 * de tenant, a **ausência de `severity`** em toda a superfície, e a distinção
 * entre "a linha sumiu" e "a policy recusou a escrita".
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const OTHER_CLINIC = 'b4b7c0f2-1f6a-4a55-9d5a-2f7b1c3d4e5f'
const PATIENT = '22222222-2222-4222-8222-222222222222'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const ALLERGY = '11111111-1111-4111-8111-111111111111'

interface RecordedCall {
  table: string
  method: string
  args: unknown[]
}

function allergyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ALLERGY,
    clinic_id: CLINIC,
    patient_id: PATIENT,
    substance: 'Dipirona',
    reaction: 'Urticária',
    is_active: true,
    recorded_by: USER,
    created_at: '2026-08-09T10:00:00.000Z',
    ...overrides,
  }
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

    const chain = (method: string) => (...args: unknown[]) => {
      calls.push({ table, method, args })
      return builder
    }

    for (const method of ['select', 'eq', 'order', 'limit', 'insert', 'update']) {
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
    argsOf: (method: string) => calls.filter((call) => call.method === method).map((call) => call.args),
    subject: new SupabaseAllergyRepository({ from } as never),
  }
}

/**
 * A decisão que dá nome a esta fatia.
 *
 * `allergies.severity` é `integer` nullable e não tem convenção verificável:
 * pode ser 1–3, 1–5, 0–10, e pode crescer para cima ou para baixo. É o mesmo
 * bloqueio de `work_schedules.weekday`, com consequência pior — uma alergia
 * gravada como "leve" quando a escala do banco dizia "grave" é exatamente o que
 * alguém confere antes de aplicar um medicamento.
 */
describe('severity fica fora de toda a superfície', () => {
  it('não é lida', () => {
    // Ler colocaria a coluna no DTO, e um número no DTO acaba na tela — sob uma
    // escala que ninguém verificou.
    const { subject, argsOf } = repository({ rows: [allergyRow()] })

    void subject.listByPatient(CLINIC, PATIENT)

    const columns = argsOf('select')[0][0] as string
    expect(columns).not.toContain('severity')
  })

  it('não é gravada no insert', async () => {
    const { subject, argsOf } = repository({ singles: [allergyRow()] })

    await subject.record(CLINIC, USER, {
      patientId: PATIENT,
      substance: 'Dipirona',
      reaction: null,
    })

    expect(argsOf('insert')[0][0]).not.toHaveProperty('severity')
  })

  it('não é gravada no update', async () => {
    const { subject, argsOf } = repository({ singles: [allergyRow()] })

    await subject.update(CLINIC, ALLERGY, { substance: 'Dipirona', reaction: 'Edema' })

    expect(argsOf('update')[0][0]).not.toHaveProperty('severity')
  })
})

describe('leitura', () => {
  it('filtra por clínica E paciente', async () => {
    const { subject, argsOf } = repository({ rows: [allergyRow()] })

    await subject.listByPatient(OTHER_CLINIC, PATIENT)

    expect(argsOf('eq')).toContainEqual(['clinic_id', OTHER_CLINIC])
    expect(argsOf('eq')).toContainEqual(['patient_id', PATIENT])
  })

  it('mapeia a linha sem expor colunas cruas', async () => {
    const { subject } = repository({ rows: [allergyRow()] })

    const [allergy] = await subject.listByPatient(CLINIC, PATIENT)

    expect(allergy).toEqual({
      id: ALLERGY,
      patientId: PATIENT,
      substance: 'Dipirona',
      reaction: 'Urticária',
      isActive: true,
      recordedBy: USER,
      recordedAt: new Date('2026-08-09T10:00:00.000Z'),
    })
  })

  it('findById é escopado na clínica', async () => {
    // A edição usa este valor para descobrir a qual paciente a linha pertence;
    // sem o filtro de clínica, apontaria para a ficha de outro tenant.
    const { subject, argsOf } = repository({ singles: [allergyRow()] })

    await subject.findById(CLINIC, ALLERGY)

    expect(argsOf('eq')).toContainEqual(['clinic_id', CLINIC])
    expect(argsOf('eq')).toContainEqual(['id', ALLERGY])
  })

  it('findById devolve null quando não existe aqui', async () => {
    const { subject } = repository({ singles: [null] })

    await expect(subject.findById(CLINIC, ALLERGY)).resolves.toBeNull()
  })
})

describe('escrita', () => {
  it('a alergia nasce ativa e com o autor da sessão', async () => {
    const { subject, argsOf } = repository({ singles: [allergyRow()] })

    await subject.record(CLINIC, USER, {
      patientId: PATIENT,
      substance: 'Dipirona',
      reaction: null,
    })

    expect(argsOf('insert')[0][0]).toMatchObject({
      clinic_id: CLINIC,
      patient_id: PATIENT,
      is_active: true,
      recorded_by: USER,
    })
  })

  it('descartar só mexe em `is_active`', async () => {
    /*
     * Não existe exclusão: uma alergia registrada por engano continua sendo
     * história clínica, e apagar a linha apagaria o registro de que a
     * informação existiu.
     */
    const { subject, argsOf } = repository({ singles: [allergyRow({ is_active: false })] })

    await subject.setActive(CLINIC, ALLERGY, false)

    expect(Object.keys(argsOf('update')[0][0] as object)).toEqual(['is_active'])
  })

  it('zero linhas com a alergia ainda legível é recusa de escrita', async () => {
    const { subject } = repository({ singles: [null, { id: ALLERGY }] })

    await expect(subject.setActive(CLINIC, ALLERGY, false)).rejects.toMatchObject({
      reason: 'write-forbidden',
    })
  })

  it('zero linhas com a alergia ausente é not-found', async () => {
    const { subject } = repository({ singles: [null, null] })

    await expect(subject.setActive(CLINIC, ALLERGY, false)).rejects.toMatchObject({
      reason: 'not-found',
    })
  })
})

describe('tradução das recusas do banco', () => {
  async function reasonOf(error: { code?: string | null; message?: string | null }) {
    const { subject } = repository({ error })
    return subject
      .listByPatient(CLINIC, PATIENT)
      .then(() => 'sem erro')
      .catch((cause: { reason: string }) => cause.reason)
  }

  it('recusa da policy é forbidden', async () => {
    expect(await reasonOf({ code: '42501' })).toBe('forbidden')
    expect(await reasonOf({ code: 'PGRST301' })).toBe('forbidden')
  })

  it('índice único vira duplicidade, e não erro genérico', async () => {
    // A aplicação checa antes para dar mensagem melhor, mas a checagem dela tem
    // janela de corrida — esta não tem.
    expect(await reasonOf({ code: '23505' })).toBe('duplicate')
  })

  it('queda de rede é retentável', async () => {
    expect(await reasonOf({ message: 'fetch failed' })).toBe('unavailable')
  })

  it('o resto é inesperado, e leva o código para o log', async () => {
    const { subject } = repository({ error: { code: '23502' } })

    await expect(subject.listByPatient(CLINIC, PATIENT)).rejects.toMatchObject({
      reason: 'unexpected',
      code: '23502',
    })
  })
})
