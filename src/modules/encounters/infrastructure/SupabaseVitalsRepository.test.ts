import { describe, expect, it, vi } from 'vitest'

import { SupabaseVitalsRepository } from './SupabaseVitalsRepository'

/**
 * Contrato dos sinais vitais.
 *
 * Sem banco e sem rede — o cliente é um duplo. `vitals` já existe no schema
 * aplicado. O que se prova é o escopo de tenant, a ordem do histórico e que a
 * superfície é **append-only**: a tabela não tem `updated_at` nem `deleted_at`,
 * e o repositório não oferece update nem delete.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const OTHER_CLINIC = 'b4b7c0f2-1f6a-4a55-9d5a-2f7b1c3d4e5f'
const PATIENT = '22222222-2222-4222-8222-222222222222'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const ENCOUNTER = '44444444-4444-4444-8444-444444444444'

interface RecordedCall {
  table: string
  method: string
  args: unknown[]
}

function vitalsRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    clinic_id: CLINIC,
    patient_id: PATIENT,
    encounter_id: null,
    measured_at: '2026-08-10T13:00:00.000Z',
    weight_kg: 70,
    height_cm: 175,
    systolic_bp: 120,
    diastolic_bp: 80,
    heart_rate: 72,
    respiratory_rate: null,
    temperature_c: 36.5,
    spo2: 97,
    glucose_mgdl: null,
    notes: null,
    recorded_by: USER,
    ...overrides,
  }
}

interface FakeOptions {
  rows?: unknown[]
  single?: unknown
  error?: { code?: string | null; message?: string | null }
}

function repository(options: FakeOptions = {}) {
  const calls: RecordedCall[] = []

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
      data: options.error ? null : ('single' in options ? options.single : vitalsRow()),
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
    subject: new SupabaseVitalsRepository({ from } as never),
  }
}

describe('leitura', () => {
  it('filtra por clínica E paciente', async () => {
    const { subject, argsOf } = repository({ rows: [vitalsRow()] })

    await subject.listByPatient(OTHER_CLINIC, PATIENT)

    expect(argsOf('eq')).toContainEqual(['clinic_id', OTHER_CLINIC])
    expect(argsOf('eq')).toContainEqual(['patient_id', PATIENT])
  })

  it('pede as mais recentes primeiro', async () => {
    /*
     * O teto de linhas descarta pelo fim da ordem. Crescente, ele guardaria as
     * aferições antigas e esconderia as recentes — que são as que decidem
     * alguma coisa. É a lição do teto de mensagens da Inbox.
     */
    const { subject, argsOf } = repository({ rows: [] })

    await subject.listByPatient(CLINIC, PATIENT)

    expect(argsOf('order')).toContainEqual(['measured_at', { ascending: false }])
  })

  it('mapeia mantendo os nulos como nulos', async () => {
    // O que não foi medido não pode virar zero na travessia.
    const { subject } = repository({ rows: [vitalsRow()] })

    const [entry] = await subject.listByPatient(CLINIC, PATIENT)

    expect(entry).toMatchObject({
      systolicBp: 120,
      diastolicBp: 80,
      temperatureC: 36.5,
      respiratoryRate: null,
      glucoseMgdl: null,
    })
  })
})

/**
 * As consultas de verificação existem porque a FK de `vitals` é de coluna única
 * e não carrega o tenant.
 */
describe('verificação do alvo', () => {
  it('o paciente é procurado com a clínica no filtro', async () => {
    const { subject, calls, argsOf } = repository({ single: { id: PATIENT } })

    await expect(subject.patientBelongsTo(CLINIC, PATIENT)).resolves.toBe(true)

    expect(calls[0].table).toBe('patients')
    expect(argsOf('eq')).toContainEqual(['clinic_id', CLINIC])
    expect(argsOf('eq')).toContainEqual(['id', PATIENT])
  })

  it('paciente de outra clínica devolve false', async () => {
    const { subject } = repository({ single: null })

    await expect(subject.patientBelongsTo(CLINIC, PATIENT)).resolves.toBe(false)
  })

  it('a verificação só pede o `id` — nada de dado de paciente', async () => {
    // Conferir um vínculo não justifica trazer a ficha para a memória.
    const { subject, argsOf } = repository({ single: { id: PATIENT } })

    await subject.patientBelongsTo(CLINIC, PATIENT)

    expect(argsOf('select')[0][0]).toBe('id')
  })

  it('o atendimento é filtrado por clínica, id E paciente', async () => {
    /*
     * A terceira condição é a que a FK não cobre: dentro da mesma clínica, um
     * atendimento de outro paciente passaria.
     */
    const { subject, calls, argsOf } = repository({ single: { id: ENCOUNTER } })

    await expect(
      subject.encounterBelongsTo(CLINIC, ENCOUNTER, PATIENT),
    ).resolves.toBe(true)

    expect(calls[0].table).toBe('encounters')
    expect(argsOf('eq')).toContainEqual(['clinic_id', CLINIC])
    expect(argsOf('eq')).toContainEqual(['id', ENCOUNTER])
    expect(argsOf('eq')).toContainEqual(['patient_id', PATIENT])
  })

  it('atendimento que não casa devolve false', async () => {
    const { subject } = repository({ single: null })

    await expect(
      subject.encounterBelongsTo(CLINIC, ENCOUNTER, PATIENT),
    ).resolves.toBe(false)
  })
})

describe('append-only', () => {
  it('a aferição nasce com a clínica e o autor da sessão', async () => {
    const { subject, argsOf } = repository({ single: vitalsRow() })

    await subject.record(CLINIC, USER, {
      patientId: PATIENT,
      encounterId: null,
      measuredAt: new Date('2026-08-10T13:00:00.000Z'),
      weightKg: null,
      heightCm: null,
      systolicBp: 120,
      diastolicBp: 80,
      heartRate: null,
      respiratoryRate: null,
      temperatureC: null,
      spo2: null,
      glucoseMgdl: null,
      notes: null,
    })

    expect(argsOf('insert')[0][0]).toMatchObject({
      clinic_id: CLINIC,
      patient_id: PATIENT,
      recorded_by: USER,
    })
  })

  it('o que não foi medido vai como null, e não como zero', async () => {
    const { subject, argsOf } = repository({ single: vitalsRow() })

    await subject.record(CLINIC, USER, {
      patientId: PATIENT,
      encounterId: null,
      measuredAt: new Date('2026-08-10T13:00:00.000Z'),
      weightKg: null,
      heightCm: null,
      systolicBp: null,
      diastolicBp: null,
      heartRate: null,
      respiratoryRate: null,
      temperatureC: null,
      spo2: 97,
      glucoseMgdl: null,
      notes: null,
    })

    const payload = argsOf('insert')[0][0] as Record<string, unknown>
    expect(payload.glucose_mgdl).toBeNull()
    expect(payload.weight_kg).toBeNull()
    expect(payload.spo2).toBe(97)
  })

  it('o repositório não expõe update nem delete', () => {
    /*
     * A ausência é o desenho do schema: `vitals` não tem `updated_at` nem
     * `deleted_at`. Um método aqui seria convite para alguém sobrescrever a
     * aferição original, que é a única prova do que se mediu naquela hora.
     */
    const { subject } = repository()

    expect((subject as unknown as Record<string, unknown>).update).toBeUndefined()
    expect((subject as unknown as Record<string, unknown>).softDelete).toBeUndefined()
    expect((subject as unknown as Record<string, unknown>).remove).toBeUndefined()
  })

  it('nenhuma escrita usa update ou delete no cliente', async () => {
    const { subject, calls } = repository({ single: vitalsRow() })

    await subject.record(CLINIC, USER, {
      patientId: PATIENT,
      encounterId: null,
      measuredAt: new Date('2026-08-10T13:00:00.000Z'),
      weightKg: null,
      heightCm: null,
      systolicBp: null,
      diastolicBp: null,
      heartRate: null,
      respiratoryRate: null,
      temperatureC: null,
      spo2: 97,
      glucoseMgdl: null,
      notes: null,
    })

    expect(calls.some((call) => ['update', 'delete'].includes(call.method))).toBe(false)
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

  it('chave estrangeira é not-found, e não falha inesperada', async () => {
    // O paciente não existe nesta clínica. "Tente de novo" nunca vai passar.
    expect(await reasonOf({ code: '23503' })).toBe('not-found')
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
