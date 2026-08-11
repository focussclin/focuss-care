// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * O prontuário dentro da ficha do paciente.
 *
 * O que este arquivo protege é a diferença entre o que o painel **afirma** e o
 * que ele sabe: vínculo ausente não é vínculo inexistente, lista cortada não é
 * prontuário inteiro, e demonstração não é registro.
 */

const PATIENT = '22222222-2222-4222-8222-222222222222'
const ENCOUNTER = '44444444-4444-4444-8444-444444444444'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const createRecordAction = vi.fn()
vi.mock('../actions/createRecord.action', () => ({
  createRecordAction: (input: unknown) => createRecordAction(input),
}))

const amendRecordAction = vi.fn()
vi.mock('../actions/amendRecord.action', () => ({
  amendRecordAction: (input: unknown) => amendRecordAction(input),
}))

const listPatientEncountersAction = vi.fn()
vi.mock('../actions/listPatientEncounters.action', () => ({
  listPatientEncountersAction: (input: unknown) =>
    listPatientEncountersAction(input),
}))

const listRecordVersionsAction = vi.fn()
vi.mock('../actions/listRecordVersions.action', () => ({
  listRecordVersionsAction: (input: unknown) =>
    listRecordVersionsAction(input),
}))

const { PatientRecordsPanel } = await import('./PatientRecordsPanel')
const { PATIENT_RECORD_LIMIT } = await import('../schemas/record.schema')

type PanelProps = React.ComponentProps<typeof PatientRecordsPanel>
type RecordDto = PanelProps['records'][number]

const encounter = {
  id: ENCOUNTER,
  status: 'closed' as const,
  startedAt: '2026-08-10T13:00:00.000Z',
  endedAt: '2026-08-10T13:40:00.000Z',
  professionalName: 'Dra. Helena',
  chiefComplaint: 'Dor lombar há três dias',
}

function medicalRecord(overrides: Partial<RecordDto> = {}): RecordDto {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    patientId: PATIENT,
    encounterId: null,
    encounter: null,
    authorId: '55555555-5555-4555-8555-555555555555',
    authorName: 'Dra. Helena',
    recordType: 'evolution',
    content: 'Paciente relatou melhora da dor.',
    version: 1,
    supersedesId: null,
    signedAt: null,
    createdAt: '2026-08-10T17:45:00.000Z',
    ...overrides,
  }
}

afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
  createRecordAction.mockResolvedValue({ ok: true, data: {} })
  amendRecordAction.mockResolvedValue({ ok: true, data: {} })
  listPatientEncountersAction.mockResolvedValue({ ok: true, data: [encounter] })
  listRecordVersionsAction.mockResolvedValue({ ok: true, data: [] })
})

function renderPanel(overrides: Partial<PanelProps> = {}) {
  return render(
    <PatientRecordsPanel
      patientId={PATIENT}
      patientName="Joana Ribeiro"
      records={[medicalRecord()]}
      canWrite
      isProfessional
      isLive
      limit={PATIENT_RECORD_LIMIT}
      {...overrides}
    />,
  )
}

describe('a lista mostra o registro clínico', () => {
  it('tipo, autor e data acompanham o texto', () => {
    renderPanel()

    expect(screen.getByText('Evolução clínica')).toBeTruthy()
    expect(screen.getByText(/Dra\. Helena/)).toBeTruthy()
    expect(screen.getByText('Paciente relatou melhora da dor.')).toBeTruthy()
  })

  it('a versão fica visível mesmo na primeira', () => {
    // É o que comunica que o prontuário é versionado antes de alguém precisar
    // corrigir alguma coisa.
    renderPanel()

    expect(screen.getByText('Versão 1')).toBeTruthy()
  })

  it('registro corrigido oferece o histórico das versões', () => {
    /*
     * Antes havia aqui um ícone que anunciava "corrigido 2 vezes" e não levava
     * a lugar nenhum: informava que existia algo a ver, sem oferecer o ver.
     */
    renderPanel({ records: [medicalRecord({ version: 3 })] })

    expect(screen.getByText('Versão 3')).toBeTruthy()
    expect(screen.getByRole('button', { name: /ver histórico/i })).toBeTruthy()
  })

  it('registro em primeira versão não oferece histórico', () => {
    // A cadeia é a própria linha: um botão que abrisse um item repetido seria
    // trabalho oferecido em troca de nada.
    renderPanel()

    expect(screen.queryByRole('button', { name: /ver histórico/i })).toBeNull()
  })

  it('abrir o histórico pede a cadeia daquele registro', async () => {
    renderPanel({ records: [medicalRecord({ version: 3 })] })

    fireEvent.click(screen.getByRole('button', { name: /ver histórico/i }))

    await waitFor(() =>
      expect(listRecordVersionsAction).toHaveBeenCalledWith({
        recordId: medicalRecord().id,
      }),
    )
  })

  it('vazio não afirma que o paciente nunca foi atendido', () => {
    renderPanel({ records: [] })

    expect(screen.getByText(/Nenhum registro no prontuário deste paciente/i)).toBeTruthy()
  })
})

describe('o vínculo com o atendimento', () => {
  it('a queixa principal aparece ao lado da conduta', () => {
    /*
     * A integração que esta fatia entrega: a queixa registrada em
     * `/atendimentos` passa a ser lida na ficha, ao lado do registro que ela
     * originou.
     */
    renderPanel({
      records: [medicalRecord({ encounterId: ENCOUNTER, encounter })],
    })

    expect(screen.getByText(/Queixa principal:/i)).toBeTruthy()
    expect(screen.getByText(/Dor lombar há três dias/)).toBeTruthy()
    expect(screen.getByText(/Atendimento de .* · Encerrado · Dra\. Helena/)).toBeTruthy()
  })

  it('atendimento sem queixa não inventa uma', () => {
    renderPanel({
      records: [
        medicalRecord({
          encounterId: ENCOUNTER,
          encounter: { ...encounter, chiefComplaint: null },
        }),
      ],
    })

    expect(screen.queryByText(/Queixa principal:/i)).toBeNull()
    expect(screen.getByText(/Atendimento de/)).toBeTruthy()
  })

  it('vínculo ilegível NÃO vira "sem vínculo"', () => {
    /*
     * `encounter` nulo com `encounterId` presente é "não deu para ler o
     * atendimento", não "este registro nasceu solto". Afirmar o segundo seria o
     * contrário do que a linha diz — e é justamente o registro que menos pode
     * mentir.
     */
    renderPanel({
      records: [medicalRecord({ encounterId: ENCOUNTER, encounter: null })],
    })

    expect(screen.getByText(/não pôde ser carregado/i)).toBeTruthy()
  })

  it('registro sem vínculo não menciona atendimento nenhum', () => {
    renderPanel()

    expect(screen.queryByText(/Atendimento de/)).toBeNull()
    expect(screen.queryByText(/não pôde ser carregado/i)).toBeNull()
  })
})

describe('o corte da lista é declarado', () => {
  it('lista cheia avisa que há registro mais antigo', () => {
    const records = Array.from({ length: PATIENT_RECORD_LIMIT }, (_, index) =>
      medicalRecord({ id: `rec-${index}` }),
    )

    renderPanel({ records })

    expect(screen.getByText(/Mostrando os 20 registros mais recentes/i)).toBeTruthy()
  })

  it('lista curta não sugere que falta alguma coisa', () => {
    renderPanel()

    expect(screen.queryByText(/Mostrando os/i)).toBeNull()
  })
})

describe('escrever exige as duas portas', () => {
  it('sem `record.write` não há botão de registrar', () => {
    renderPanel({ canWrite: false })

    expect(screen.queryByRole('button', { name: /nova evolução/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /corrigir/i })).toBeNull()
  })

  it('com papel e SEM cadastro profissional, a tela diz o que fazer', () => {
    /*
     * `author_id` é `professionals.id`: quem não tem linha lá não assina
     * prontuário, mesmo sendo dono da clínica.
     */
    renderPanel({ isProfessional: false })

    expect(screen.getByRole('status').textContent).toMatch(
      /profissionais de saúde cadastrados/i,
    )
    expect(
      screen.getByRole('button', { name: /nova evolução/i }).hasAttribute('disabled'),
    ).toBe(true)
  })

  it('não existe apagar registro', () => {
    // `medical_records` é append-only: história clínica que some não vale como
    // prova de nada.
    renderPanel()

    expect(screen.queryByRole('button', { name: /excluir|apagar|remover/i })).toBeNull()
    expect(screen.getByRole('button', { name: /corrigir/i })).toBeTruthy()
  })
})

describe('o registro nasce do paciente da ficha', () => {
  it('o formulário não oferece outro paciente', async () => {
    /*
     * Enquanto houver `<select>` de paciente existe um caminho para pendurar a
     * evolução na pessoa errada. Aqui o id vem da rota já validada.
     */
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /nova evolução/i }))

    expect(screen.queryByLabelText(/^paciente$/i)).toBeNull()
    expect(screen.getByText(/Registro de/)).toBeTruthy()
    expect(screen.getByText('Joana Ribeiro')).toBeTruthy()
  })

  it('os atendimentos do paciente já são buscados ao abrir', async () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /nova evolução/i }))

    await waitFor(() =>
      expect(listPatientEncountersAction).toHaveBeenCalledWith({
        patientId: PATIENT,
      }),
    )
  })

  it('salva com o paciente da ficha e o vínculo escolhido', async () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /nova evolução/i }))

    await waitFor(() => expect(screen.getByLabelText(/atendimento/i)).toBeTruthy())
    fireEvent.change(screen.getByLabelText(/atendimento/i), {
      target: { value: ENCOUNTER },
    })
    fireEvent.change(screen.getByLabelText(/^registro$/i), {
      target: { value: 'Conduta mantida.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /salvar registro/i }))

    await waitFor(() =>
      expect(createRecordAction).toHaveBeenCalledWith({
        patientId: PATIENT,
        encounterId: ENCOUNTER,
        recordType: 'evolution',
        content: 'Conduta mantida.',
      }),
    )
  })

  it('corrigir manda só o registro e o texto', async () => {
    renderPanel()
    fireEvent.click(screen.getByRole('button', { name: /corrigir/i }))

    fireEvent.change(screen.getByLabelText(/^registro$/i), {
      target: { value: 'Texto corrigido.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /salvar registro/i }))

    // Paciente, tipo e atendimento são herdados da versão anterior pelo
    // servidor — nada disso viaja de novo.
    await waitFor(() =>
      expect(amendRecordAction).toHaveBeenCalledWith({
        recordId: medicalRecord().id,
        content: 'Texto corrigido.',
      }),
    )
  })
})

describe('estados', () => {
  it('modo demonstração não promete gravação nem auditoria', () => {
    renderPanel({ isLive: false, records: [] })

    const statuses = screen.getAllByRole('status').map((node) => node.textContent)

    expect(statuses.join(' ')).toMatch(/modo demonstração/i)
    expect(screen.queryByText(/Cada acesso a este prontuário fica registrado/i)).toBeNull()
    /*
     * A rota não consulta prontuário em demonstração: dizer "este paciente não
     * tem registro" seria falar por uma base que nem foi lida.
     */
    expect(screen.getByText(/não fabrica prontuário/i)).toBeTruthy()
    expect(screen.queryByText(/Nenhum registro no prontuário deste paciente/i)).toBeNull()
    expect(
      screen.getByRole('button', { name: /nova evolução/i }).hasAttribute('disabled'),
    ).toBe(true)
  })

  it('não repete o aviso de acesso registrado, que é da rota', () => {
    /*
     * Este painel é um de quatro recortes clínicos da ficha. Quem sabe quais
     * foram entregues a quem está lendo é a rota, e ela declara o registro uma
     * vez acima do bloco clínico — a recepção recebe sinais vitais e não recebe
     * prontuário. Um aviso por painel repetiria a mesma frase quatro vezes
     * dizendo menos.
     */
    renderPanel()

    expect(screen.queryByText(/acesso.*registrado/i)).toBeNull()
  })

  it('falha de leitura aparece e fecha a escrita', () => {
    renderPanel({
      records: [],
      loadError: 'Não foi possível falar com o servidor agora. Tente novamente.',
    })

    expect(screen.getByRole('alert').textContent).toMatch(/servidor/i)
    // Registrar sobre uma lista que não carregou faria a pessoa reescrever o que
    // talvez já esteja lá.
    expect(
      screen.getByRole('button', { name: /nova evolução/i }).hasAttribute('disabled'),
    ).toBe(true)
    expect(screen.queryByText(/Nenhum registro no prontuário/i)).toBeNull()
  })
})
