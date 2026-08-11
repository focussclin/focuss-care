import { describe, expect, it, vi } from 'vitest'

import { SupabaseMedicalRecordRepository } from './SupabaseMedicalRecordRepository'

/**
 * Contrato do prontuário (R-01).
 *
 * O que este arquivo protege é a propriedade que faz um prontuário valer como
 * registro: **nada é reescrito no lugar**. Corrigir insere uma linha nova
 * apontando para a anterior. Se algum dia alguém trocar isso por um `update`,
 * o primeiro teste daqui quebra — e é para isso que ele existe.
 *
 * Sem banco e sem rede. Tenancy real continua sendo pgTAP (R1).
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const AUTHOR = '22222222-2222-4222-8222-222222222222'
const PATIENT = '33333333-3333-4333-8333-333333333333'
const RECORD = '9019956f-bdd8-4d61-868d-09b02332dad0'
const ENCOUNTER = '44444444-4444-4444-8444-444444444444'

interface RecordedCall {
  query: number
  table: string
  method: string
  args: unknown[]
}

function recordRow(overrides: Record<string, unknown> = {}) {
  return {
    id: RECORD,
    patient_id: PATIENT,
    encounter_id: null,
    author_id: AUTHOR,
    record_type: 'evolution',
    content_text: 'Paciente relatou melhora.',
    content_hash: 'abc',
    version: 1,
    supersedes_id: null,
    signed_at: null,
    created_at: '2026-08-07T12:00:00.000Z',
    ...overrides,
  }
}

function encounterRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ENCOUNTER,
    status: 'open',
    started_at: '2026-08-07T11:30:00.000Z',
    ended_at: null,
    chief_complaint: 'Dor lombar há três dias',
    professional: { display_name: 'Dra. Helena' },
    ...overrides,
  }
}

function createFakeClient(results: {
  previous?: unknown
  successor?: unknown
  inserted?: unknown
  rows?: unknown[]
  /** Linhas por TABELA — o que uma leitura hidratada precisa distinguir. */
  rowsByTable?: Record<string, unknown[]>
  /** Tabela cuja leitura falha, para provar que a falha é best-effort. */
  failingTable?: string
  /** Resposta de `maybeSingle` por tabela, quando a ordem não basta. */
  singleByTable?: Record<string, unknown>
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

    for (const method of [
      'select',
      'eq',
      'neq',
      'in',
      'is',
      'order',
      'limit',
      'insert',
      'update',
      'delete',
    ]) {
      query[method] = (...args: unknown[]) => {
        record(method, args)
        return query
      }
    }

    query.single = async () => {
      record('single', [])
      return {
        data: 'inserted' in results ? results.inserted : recordRow(),
        error: null,
      }
    }

    query.maybeSingle = async () => {
      record('maybeSingle', [])

      if (results.singleByTable && table in results.singleByTable) {
        return { data: results.singleByTable[table], error: null }
      }

      maybeSingleCount += 1

      // Em `amend` a ordem e: (1) versao anterior, (2) sucessor.
      if (maybeSingleCount === 1) {
        return {
          data: 'previous' in results ? results.previous : recordRow(),
          error: null,
        }
      }

      return {
        data: 'successor' in results ? results.successor : null,
        error: null,
      }
    }

    query.then = (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => {
      const failed = results.failingTable === table
      const rows = results.rowsByTable?.[table] ?? results.rows ?? []

      return Promise.resolve(
        failed
          ? { data: null, error: { code: '42501', message: 'recusado' } }
          : { data: rows, error: null },
      ).then(onFulfilled, onRejected)
    }

    return query
  })

  return {
    calls,
    client: { from } as never,
    ofTable: (table: string) => calls.filter((call) => call.table === table),
  }
}

describe('append-only', () => {
  it('corrigir INSERE uma versão nova — nunca faz update', async () => {
    const fake = createFakeClient({
      inserted: recordRow({ id: 'novo', version: 2, supersedes_id: RECORD }),
    })

    await new SupabaseMedicalRecordRepository(fake.client).amend(
      CLINIC,
      RECORD,
      'Texto corrigido.',
      AUTHOR,
      USER,
    )

    const records = fake.ofTable('medical_records')

    /*
     * A garantia central de R-01. Um `update` aqui reescreveria a historia
     * clinica do paciente, e o registro deixaria de valer como prova de
     * qualquer coisa.
     */
    expect(records.some((call) => call.method === 'update')).toBe(false)
    expect(records.some((call) => call.method === 'delete')).toBe(false)
    expect(records.some((call) => call.method === 'insert')).toBe(true)
  })

  it('a versão nova aponta para a anterior e incrementa', async () => {
    const fake = createFakeClient({
      previous: recordRow({ version: 3 }),
      inserted: recordRow({ version: 4, supersedes_id: RECORD }),
    })

    await new SupabaseMedicalRecordRepository(fake.client).amend(
      CLINIC,
      RECORD,
      'Texto corrigido.',
      AUTHOR,
      USER,
    )

    const insert = fake
      .ofTable('medical_records')
      .find((call) => call.method === 'insert')?.args[0] as Record<
      string,
      unknown
    >

    expect(insert.supersedes_id).toBe(RECORD)
    expect(insert.version).toBe(4)
  })

  it('herda paciente e tipo da versão anterior', async () => {
    const fake = createFakeClient({
      previous: recordRow({ patient_id: PATIENT, record_type: 'anamnesis' }),
    })

    await new SupabaseMedicalRecordRepository(fake.client).amend(
      CLINIC,
      RECORD,
      'Texto corrigido.',
      AUTHOR,
      USER,
    )

    const insert = fake
      .ofTable('medical_records')
      .find((call) => call.method === 'insert')?.args[0] as Record<
      string,
      unknown
    >

    // Corrigir o texto nao pode, por acidente, mudar de quem e o registro.
    expect(insert.patient_id).toBe(PATIENT)
    expect(insert.record_type).toBe('anamnesis')
  })

  it('recusa corrigir uma versão que já foi corrigida', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = createFakeClient({ successor: { id: 'ja-existe' } })

    await expect(
      new SupabaseMedicalRecordRepository(fake.client).amend(
        CLINIC,
        RECORD,
        'Segunda correcao concorrente.',
        AUTHOR,
        USER,
      ),
    ).rejects.toMatchObject({ reason: 'superseded' })

    // Sem esta guarda a cadeia ganharia um ramo paralelo, e o prontuario
    // passaria a ter duas "ultimas versoes".
    expect(
      fake.ofTable('medical_records').some((call) => call.method === 'insert'),
    ).toBe(false)

    spy.mockRestore()
  })

  it('registro inexistente na clínica ativa vira not-found', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = createFakeClient({ previous: null })

    await expect(
      new SupabaseMedicalRecordRepository(fake.client).amend(
        CLINIC,
        RECORD,
        'Texto.',
        AUTHOR,
        USER,
      ),
    ).rejects.toMatchObject({ reason: 'not-found' })

    spy.mockRestore()
  })
})

describe('create', () => {
  it('grava a primeira versão com autor profissional e hash do conteúdo', async () => {
    const fake = createFakeClient({})

    await new SupabaseMedicalRecordRepository(fake.client).create(
      CLINIC,
      {
        patientId: PATIENT,
        encounterId: null,
        recordType: 'evolution',
        content: 'Paciente relatou melhora.',
      },
      AUTHOR,
      USER,
    )

    const insert = fake
      .ofTable('medical_records')
      .find((call) => call.method === 'insert')?.args[0] as Record<
      string,
      unknown
    >

    expect(insert.clinic_id).toBe(CLINIC)
    // `author_id` e `professionals.id`: quem assina tem conselho e
    // responsabilidade clinica, nao e um login.
    expect(insert.author_id).toBe(AUTHOR)
    expect(insert.author_user_id).toBe(USER)
    expect(insert.version).toBe(1)
    expect(insert.supersedes_id).toBeNull()
    // NOT NULL no schema: sem ele o insert e recusado.
    expect(insert.content_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('o hash é determinístico e muda com o conteúdo', async () => {
    async function hashOf(content: string) {
      const fake = createFakeClient({})
      await new SupabaseMedicalRecordRepository(fake.client).create(
        CLINIC,
        { patientId: PATIENT, encounterId: null, recordType: 'note', content },
        AUTHOR,
        USER,
      )

      const insert = fake
        .ofTable('medical_records')
        .find((call) => call.method === 'insert')?.args[0] as Record<
        string,
        unknown
      >

      return insert.content_hash
    }

    expect(await hashOf('mesmo texto')).toBe(await hashOf('mesmo texto'))
    expect(await hashOf('texto A')).not.toBe(await hashOf('texto B'))
  })

  it('grava o atendimento vinculado', async () => {
    const fake = createFakeClient({})

    await new SupabaseMedicalRecordRepository(fake.client).create(
      CLINIC,
      {
        patientId: PATIENT,
        encounterId: ENCOUNTER,
        recordType: 'evolution',
        content: 'Conduta mantida.',
      },
      AUTHOR,
      USER,
    )

    const insert = fake
      .ofTable('medical_records')
      .find((call) => call.method === 'insert')?.args[0] as Record<
      string,
      unknown
    >

    expect(insert.encounter_id).toBe(ENCOUNTER)
  })

  it('guarda o conteúdo nas duas colunas, com a mesma origem', async () => {
    const fake = createFakeClient({})

    await new SupabaseMedicalRecordRepository(fake.client).create(
      CLINIC,
      {
        patientId: PATIENT,
        encounterId: null,
        recordType: 'evolution',
        content: 'Conduta mantida.',
      },
      AUTHOR,
      USER,
    )

    const insert = fake
      .ofTable('medical_records')
      .find((call) => call.method === 'insert')?.args[0] as Record<
      string,
      unknown
    >

    // Se divergirem, a tela mostra uma coisa e a busca encontra outra.
    expect(insert.content).toEqual({ text: 'Conduta mantida.' })
    expect(insert.content_text).toBe('Conduta mantida.')
  })
})

describe('atendimentos a que vincular', () => {
  it('só os do paciente, na clínica ativa', async () => {
    const fake = createFakeClient({
      rowsByTable: { encounters: [encounterRow()] },
    })

    const encounters = await new SupabaseMedicalRecordRepository(
      fake.client,
    ).listPatientEncounters(CLINIC, PATIENT, 10)

    expect(encounters).toHaveLength(1)
    expect(fake.ofTable('encounters')).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['clinic_id', CLINIC] }),
    )
    expect(fake.ofTable('encounters')).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['patient_id', PATIENT] }),
    )
  })

  it('atendimento cancelado é excluído pelo banco, não em memória', async () => {
    /*
     * Filtrar depois de ler faria o teto de linhas contar cancelamentos: um
     * paciente com muitos deles devolveria uma lista curta demais.
     */
    const fake = createFakeClient({
      rowsByTable: { encounters: [encounterRow()] },
    })

    await new SupabaseMedicalRecordRepository(fake.client).listPatientEncounters(
      CLINIC,
      PATIENT,
      10,
    )

    expect(fake.ofTable('encounters')).toContainEqual(
      expect.objectContaining({ method: 'neq', args: ['status', 'canceled'] }),
    )
  })

  it('linha sem início não vira atendimento', async () => {
    const fake = createFakeClient({
      rowsByTable: {
        encounters: [encounterRow(), encounterRow({ id: 'x', started_at: null })],
      },
    })

    const encounters = await new SupabaseMedicalRecordRepository(
      fake.client,
    ).listPatientEncounters(CLINIC, PATIENT, 10)

    // Descartar e mais honesto que inventar uma data de inicio.
    expect(encounters).toHaveLength(1)
  })

  it('a pertinência confere clínica, atendimento e paciente no mesmo WHERE', async () => {
    const fake = createFakeClient({
      singleByTable: { encounters: { id: ENCOUNTER } },
    })

    const belongs = await new SupabaseMedicalRecordRepository(
      fake.client,
    ).encounterBelongsTo(CLINIC, ENCOUNTER, PATIENT)

    expect(belongs).toBe(true)

    const filters = fake
      .ofTable('encounters')
      .filter((call) => call.method === 'eq')
      .map((call) => call.args)

    // Comparar em memoria daria o mesmo resultado e uma armadilha: bastaria
    // esquecer uma das comparacoes para o vinculo cruzar a fronteira do tenant.
    expect(filters).toContainEqual(['clinic_id', CLINIC])
    expect(filters).toContainEqual(['id', ENCOUNTER])
    expect(filters).toContainEqual(['patient_id', PATIENT])
  })

  it('atendimento de outro paciente devolve falso', async () => {
    const fake = createFakeClient({ singleByTable: { encounters: null } })

    const belongs = await new SupabaseMedicalRecordRepository(
      fake.client,
    ).encounterBelongsTo(CLINIC, ENCOUNTER, PATIENT)

    expect(belongs).toBe(false)
  })
})

describe('leitura', () => {
  it('lê a versão vigente da view, não da tabela', async () => {
    const fake = createFakeClient({ rows: [] })

    await new SupabaseMedicalRecordRepository(fake.client).listCurrentByPatient(
      CLINIC,
      PATIENT,
      20,
    )

    // Reimplementar "qual e a ultima versao" na aplicacao daria uma segunda
    // regra para divergir da do banco.
    expect(fake.ofTable('v_medical_records_current').length).toBeGreaterThan(0)
    expect(fake.ofTable('medical_records').length).toBe(0)
  })

  it('filtra sempre pela clínica ativa', async () => {
    const fake = createFakeClient({ rows: [] })

    await new SupabaseMedicalRecordRepository(fake.client).listRecent(
      CLINIC,
      10,
    )

    expect(fake.ofTable('v_medical_records_current')).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['clinic_id', CLINIC] }),
    )
  })

  it('não traz o conteúdo jsonb bruto nem o hash para a aplicação', async () => {
    const fake = createFakeClient({ rows: [] })

    await new SupabaseMedicalRecordRepository(fake.client).listRecent(
      CLINIC,
      10,
    )

    const columns = fake
      .ofTable('v_medical_records_current')
      .find((call) => call.method === 'select')?.args[0] as string

    // Duplicar conteudo clinico no payload sem uso e superficie de vazamento
    // de graca.
    expect(columns).toContain('content_text')
    expect(columns).not.toContain('content_hash')
    expect(columns).not.toContain('signature')
  })

  it('traz o atendimento vinculado sem consulta por linha', async () => {
    const fake = createFakeClient({
      rowsByTable: {
        v_medical_records_current: [
          recordRow({ id: 'r1', encounter_id: ENCOUNTER }),
          recordRow({ id: 'r2', encounter_id: ENCOUNTER }),
        ],
        professionals: [{ id: AUTHOR, display_name: 'Dra. Helena' }],
        encounters: [encounterRow()],
      },
    })

    const records = await new SupabaseMedicalRecordRepository(
      fake.client,
    ).listRecent(CLINIC, 10)

    expect(records[0].encounter?.chiefComplaint).toBe('Dor lombar há três dias')
    expect(records[1].encounter?.id).toBe(ENCOUNTER)

    // Duas linhas, UMA consulta de atendimento: o N+1 aqui multiplicaria por
    // trinta a cada abertura da tela.
    const selects = fake
      .ofTable('encounters')
      .filter((call) => call.method === 'select')
    expect(selects).toHaveLength(1)
  })

  it('registro sem vínculo não consulta atendimento nenhum', async () => {
    const fake = createFakeClient({
      rowsByTable: {
        v_medical_records_current: [recordRow({ encounter_id: null })],
        professionals: [],
      },
    })

    const records = await new SupabaseMedicalRecordRepository(
      fake.client,
    ).listRecent(CLINIC, 10)

    expect(records[0].encounterId).toBeNull()
    expect(records[0].encounter).toBeNull()
    expect(fake.ofTable('encounters')).toHaveLength(0)
  })

  it('atendimento ilegível não apaga o vínculo nem derruba a leitura', async () => {
    /*
     * O contexto e best-effort: se a segunda consulta falhar, o registro
     * continua legivel. `encounter` fica nulo e `encounterId` permanece — dizer
     * "sem vinculo" aqui seria afirmar o contrario do que a linha diz.
     */
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = createFakeClient({
      rowsByTable: {
        v_medical_records_current: [recordRow({ encounter_id: ENCOUNTER })],
        professionals: [],
      },
      failingTable: 'encounters',
    })

    const records = await new SupabaseMedicalRecordRepository(
      fake.client,
    ).listRecent(CLINIC, 10)

    expect(records).toHaveLength(1)
    expect(records[0].encounterId).toBe(ENCOUNTER)
    expect(records[0].encounter).toBeNull()

    spy.mockRestore()
  })

  it('o contexto do atendimento também filtra pela clínica ativa', async () => {
    const fake = createFakeClient({
      rowsByTable: {
        v_medical_records_current: [recordRow({ encounter_id: ENCOUNTER })],
        professionals: [],
        encounters: [encounterRow()],
      },
    })

    await new SupabaseMedicalRecordRepository(fake.client).listRecent(CLINIC, 10)

    expect(fake.ofTable('encounters')).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['clinic_id', CLINIC] }),
    )
  })

  it('a cadeia de versões tem teto — cadeia corrompida não trava o request', async () => {
    // `supersedes_id` sempre apontando para o proprio id = ciclo.
    const fake = createFakeClient({
      previous: recordRow({ supersedes_id: RECORD }),
    })

    const versions = await new SupabaseMedicalRecordRepository(
      fake.client,
    ).listVersions(CLINIC, RECORD)

    expect(versions.length).toBeLessThanOrEqual(50)
  })
})
