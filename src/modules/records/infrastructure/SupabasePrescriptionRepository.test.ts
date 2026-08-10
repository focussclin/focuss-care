import { describe, expect, it, vi } from 'vitest'

import { SupabasePrescriptionRepository } from './SupabasePrescriptionRepository'

/**
 * Contrato das prescrições.
 *
 * Sem banco e sem rede — o cliente é um duplo. `prescriptions` e
 * `prescription_items` já existem no schema aplicado.
 *
 * O que se prova: escopo de tenant, que a ordem dos itens é a que foi digitada,
 * e que **as quatro colunas do emissor externo nunca são escritas**.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const OTHER_CLINIC = 'b4b7c0f2-1f6a-4a55-9d5a-2f7b1c3d4e5f'
const PATIENT = '22222222-2222-4222-8222-222222222222'
const ENCOUNTER = '44444444-4444-4444-8444-444444444444'
const AUTHOR = '55555555-5555-4555-8555-555555555555'
const PRESCRIPTION = '11111111-1111-4111-8111-111111111111'

interface RecordedCall {
  table: string
  method: string
  args: unknown[]
}

function prescriptionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: PRESCRIPTION,
    patient_id: PATIENT,
    encounter_id: null,
    author_id: AUTHOR,
    issued_at: '2026-08-10T13:00:00.000Z',
    valid_until: null,
    signed_at: null,
    external_url: null,
    author: { id: AUTHOR, display_name: 'Dra. Helena' },
    items: [
      {
        id: 'i2',
        drug_name: 'Dipirona',
        dosage: null,
        route: null,
        frequency: null,
        duration: null,
        quantity: null,
        instructions: null,
        sort_order: 1,
      },
      {
        id: 'i1',
        drug_name: 'Amoxicilina 500 mg',
        dosage: '1 comprimido',
        route: 'Via oral',
        frequency: '8 em 8 horas',
        duration: '7 dias',
        quantity: '1 caixa',
        instructions: 'Após as refeições.',
        sort_order: 0,
      },
    ],
    ...overrides,
  }
}

interface FakeOptions {
  rows?: unknown[]
  singles?: unknown[]
  error?: { code?: string | null; message?: string | null }
  itemsError?: { code?: string | null; message?: string | null }
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

    for (const method of ['select', 'eq', 'order', 'limit', 'insert']) {
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

    /*
     * O insert dos ITENS é aguardado sem `.select()`, então o duplo precisa
     * resolver pelo `then` — e é aqui que a falha do segundo insert entra.
     */
    builder.then = (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) =>
      Promise.resolve({
        data: options.error ? null : (options.rows ?? []),
        error:
          table === 'prescription_items'
            ? (options.itemsError ?? null)
            : (options.error ?? null),
      }).then(onFulfilled, onRejected)

    return builder
  })

  return {
    calls,
    argsOf: (method: string) => calls.filter((call) => call.method === method).map((call) => call.args),
    subject: new SupabasePrescriptionRepository({ from } as never),
  }
}

const newData = {
  patientId: PATIENT,
  encounterId: null,
  validUntil: null,
  items: [
    {
      drugName: 'Amoxicilina 500 mg',
      dosage: '1 comprimido',
      route: 'Via oral',
      frequency: '8 em 8 horas',
      duration: '7 dias',
      quantity: '1 caixa',
      instructions: null,
    },
    {
      drugName: 'Dipirona',
      dosage: null,
      route: null,
      frequency: null,
      duration: null,
      quantity: null,
      instructions: null,
    },
  ],
}

describe('leitura', () => {
  it('filtra por clínica E paciente', async () => {
    const { subject, argsOf } = repository({ rows: [prescriptionRow()] })

    await subject.listByPatient(OTHER_CLINIC, PATIENT)

    expect(argsOf('eq')).toContainEqual(['clinic_id', OTHER_CLINIC])
    expect(argsOf('eq')).toContainEqual(['patient_id', PATIENT])
  })

  it('devolve os itens na ordem digitada, e não na do banco', async () => {
    /*
     * A linha veio com `sort_order` 1 antes do 0 — o banco não garante ordem
     * num relacionamento aninhado. A sequência de uma receita é a que quem
     * prescreveu escolheu, e o paciente lê nela.
     */
    const { subject } = repository({ rows: [prescriptionRow()] })

    const [prescription] = await subject.listByPatient(CLINIC, PATIENT)

    expect(prescription.items.map((item) => item.drugName)).toEqual([
      'Amoxicilina 500 mg',
      'Dipirona',
    ])
  })

  it('traz o nome de quem prescreveu', async () => {
    const { subject } = repository({ rows: [prescriptionRow()] })

    const [prescription] = await subject.listByPatient(CLINIC, PATIENT)

    expect(prescription.authorName).toBe('Dra. Helena')
  })

  it('as mais recentes primeiro', async () => {
    const { subject, argsOf } = repository({ rows: [] })

    await subject.listByPatient(CLINIC, PATIENT)

    expect(argsOf('order')).toContainEqual(['issued_at', { ascending: false }])
  })
})

/**
 * As quatro colunas do emissor externo.
 *
 * `signed_at`, `signature`, `external_id` e `external_url` pertencem a um
 * sistema de assinatura que não existe. Preencher `signed_at` sem assinatura
 * real afirmaria que a receita foi assinada.
 */
describe('a aplicação nunca escreve assinatura nem emissor', () => {
  it('o insert do cabeçalho não os carrega', async () => {
    const { subject, argsOf } = repository({
      singles: [{ id: PRESCRIPTION }, prescriptionRow()],
    })

    await subject.create(CLINIC, AUTHOR, newData)

    const payload = argsOf('insert')[0][0] as Record<string, unknown>
    expect(payload).not.toHaveProperty('signed_at')
    expect(payload).not.toHaveProperty('signature')
    expect(payload).not.toHaveProperty('external_id')
    expect(payload).not.toHaveProperty('external_url')
  })

  it('`signature` e `external_id` não são nem lidos', async () => {
    /*
     * `signature` é `jsonb` de um emissor inexistente: lê-lo colocaria
     * estrutura desconhecida no DTO, e estrutura desconhecida acaba renderizada.
     */
    const { subject, argsOf } = repository({ rows: [] })

    await subject.listByPatient(CLINIC, PATIENT)

    const columns = argsOf('select')[0][0] as string
    expect(columns).not.toContain('signature')
    expect(columns).not.toContain('external_id')
    expect(columns).toContain('signed_at')
  })
})

describe('criação', () => {
  it('o autor vem de quem chamou, e a clínica também', async () => {
    const { subject, argsOf } = repository({
      singles: [{ id: PRESCRIPTION }, prescriptionRow()],
    })

    await subject.create(CLINIC, AUTHOR, newData)

    expect(argsOf('insert')[0][0]).toMatchObject({
      clinic_id: CLINIC,
      patient_id: PATIENT,
      author_id: AUTHOR,
    })
  })

  it('`sort_order` preserva a ordem digitada', async () => {
    const { subject, argsOf } = repository({
      singles: [{ id: PRESCRIPTION }, prescriptionRow()],
    })

    await subject.create(CLINIC, AUTHOR, newData)

    const items = argsOf('insert')[1][0] as { drug_name: string; sort_order: number }[]
    expect(items.map((item) => [item.drug_name, item.sort_order])).toEqual([
      ['Amoxicilina 500 mg', 0],
      ['Dipirona', 1],
    ])
  })

  it('cada item carrega a clínica — o tenant não fica só no cabeçalho', async () => {
    const { subject, argsOf } = repository({
      singles: [{ id: PRESCRIPTION }, prescriptionRow()],
    })

    await subject.create(CLINIC, AUTHOR, newData)

    const items = argsOf('insert')[1][0] as { clinic_id: string }[]
    expect(items.every((item) => item.clinic_id === CLINIC)).toBe(true)
  })

  it('falha ao gravar os itens é reportada, e não engolida', async () => {
    /*
     * Sem função no banco, cabeçalho e itens são dois inserts. Se o segundo
     * falha, a prescrição fica sem item — e quem prescreveu precisa saber
     * disso na hora, para registrar de novo.
     */
    const { subject } = repository({
      singles: [{ id: PRESCRIPTION }],
      itemsError: { code: '23503' },
    })

    await expect(subject.create(CLINIC, AUTHOR, newData)).rejects.toMatchObject({
      reason: 'not-found',
    })
  })
})

describe('verificação do alvo', () => {
  it('o paciente é procurado com a clínica no filtro', async () => {
    const { subject, calls, argsOf } = repository({ singles: [{ id: PATIENT }] })

    await expect(subject.patientBelongsTo(CLINIC, PATIENT)).resolves.toBe(true)

    expect(calls[0].table).toBe('patients')
    expect(argsOf('eq')).toContainEqual(['clinic_id', CLINIC])
  })

  it('paciente de outra clínica devolve false', async () => {
    const { subject } = repository({ singles: [null] })

    await expect(subject.patientBelongsTo(CLINIC, PATIENT)).resolves.toBe(false)
  })

  it('o atendimento é filtrado por clínica, id E paciente', async () => {
    const { subject, argsOf } = repository({ singles: [{ id: ENCOUNTER }] })

    await subject.encounterBelongsTo(CLINIC, ENCOUNTER, PATIENT)

    expect(argsOf('eq')).toContainEqual(['clinic_id', CLINIC])
    expect(argsOf('eq')).toContainEqual(['id', ENCOUNTER])
    expect(argsOf('eq')).toContainEqual(['patient_id', PATIENT])
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
  })

  it('chave estrangeira é not-found', async () => {
    expect(await reasonOf({ code: '23503' })).toBe('not-found')
  })

  it('queda de rede é retentável', async () => {
    expect(await reasonOf({ message: 'fetch failed' })).toBe('unavailable')
  })
})
