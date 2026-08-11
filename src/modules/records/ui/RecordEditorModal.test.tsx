// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * O vínculo entre a evolução e o atendimento — escolhido aqui.
 *
 * Antes desta fatia o formulário nunca enviava `encounterId`, e toda evolução da
 * base nascia solta: o prontuário não sabia dizer de qual consulta cada registro
 * havia saído.
 *
 * O modal renderiza em portal do Radix — as buscas vão em `document.body`, que é
 * o que `screen` já usa.
 */

const PATIENT = '22222222-2222-4222-8222-222222222222'
const OTHER_PATIENT = '33333333-3333-4333-8333-333333333333'
const OPEN_ENCOUNTER = '44444444-4444-4444-8444-444444444444'
const CLOSED_ENCOUNTER = '55555555-5555-4555-8555-555555555555'

const createRecordAction = vi.fn()
vi.mock('../actions/createRecord.action', () => ({
  createRecordAction: (input: unknown) => createRecordAction(input),
}))

vi.mock('../actions/amendRecord.action', () => ({
  amendRecordAction: vi.fn(),
}))

const listPatientEncountersAction = vi.fn()
vi.mock('../actions/listPatientEncounters.action', () => ({
  listPatientEncountersAction: (input: unknown) =>
    listPatientEncountersAction(input),
}))

const { RecordEditorModal } = await import('./RecordEditorModal')
const { recordMessages } = await import('../schemas/record.schema')

const openEncounter = {
  id: OPEN_ENCOUNTER,
  status: 'open' as const,
  startedAt: '2026-08-10T17:30:00.000Z',
  endedAt: null,
  professionalName: 'Dra. Helena',
  chiefComplaint: 'Dor lombar há três dias',
}

const closedEncounter = {
  id: CLOSED_ENCOUNTER,
  status: 'closed' as const,
  startedAt: '2026-08-03T13:00:00.000Z',
  endedAt: '2026-08-03T13:40:00.000Z',
  professionalName: 'Dr. Paulo',
  chiefComplaint: null,
}

afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
  createRecordAction.mockResolvedValue({ ok: true, data: {} })
  listPatientEncountersAction.mockResolvedValue({
    ok: true,
    data: [openEncounter, closedEncounter],
  })
})

function renderModal(props: Record<string, unknown> = {}) {
  render(
    <RecordEditorModal
      mode="create"
      open
      onOpenChange={vi.fn()}
      patients={[
        { id: PATIENT, name: 'João da Silva' },
        { id: OTHER_PATIENT, name: 'Maria Souza' },
      ]}
      isLive
      onDone={vi.fn()}
      {...props}
    />,
  )
}

function selectPatient(patientId: string) {
  fireEvent.change(screen.getByLabelText(/paciente/i), {
    target: { value: patientId },
  })
}

function encounterSelect(): HTMLSelectElement {
  return screen.getByLabelText(/atendimento/i) as unknown as HTMLSelectElement
}

describe('o seletor aparece quando há a quem vincular', () => {
  it('só depois de escolher o paciente', () => {
    // Sem paciente não há atendimento possível — o campo seria decorativo.
    renderModal()

    expect(screen.queryByLabelText(/atendimento/i)).toBeNull()
    expect(listPatientEncountersAction).not.toHaveBeenCalled()
  })

  it('busca os atendimentos daquele paciente', async () => {
    renderModal()
    selectPatient(PATIENT)

    await waitFor(() =>
      expect(listPatientEncountersAction).toHaveBeenCalledWith({
        patientId: PATIENT,
      }),
    )
  })

  it('em demonstração não pergunta ao servidor', () => {
    /*
     * A action recusaria por falta de sessão, e um erro vermelho diria que o
     * produto está quebrado quando ele só está sem banco.
     */
    renderModal({ isLive: false })
    selectPatient(PATIENT)

    expect(listPatientEncountersAction).not.toHaveBeenCalled()
    expect(screen.queryByLabelText(/atendimento/i)).toBeNull()
  })
})

describe('o padrão é o atendimento aberto', () => {
  it('vem pré-selecionado', async () => {
    // Quem registra a evolução com a consulta em curso está registrando aquela
    // consulta.
    renderModal()
    selectPatient(PATIENT)

    await waitFor(() => expect(encounterSelect().value).toBe(OPEN_ENCOUNTER))
  })

  it('sem atendimento aberto, nada é escolhido por conta própria', async () => {
    listPatientEncountersAction.mockResolvedValue({
      ok: true,
      data: [closedEncounter],
    })

    renderModal()
    selectPatient(PATIENT)

    await waitFor(() =>
      expect(screen.getByLabelText(/atendimento/i)).toBeTruthy(),
    )
    // Escolher um encerrado sozinho seria decidir de qual consulta o registro
    // saiu — decisão de quem assina.
    expect(encounterSelect().value).toBe('')
  })

  it('"sem vínculo" escolhido de propósito não volta atrás', async () => {
    renderModal()
    selectPatient(PATIENT)

    await waitFor(() => expect(encounterSelect().value).toBe(OPEN_ENCOUNTER))

    fireEvent.change(encounterSelect(), { target: { value: '' } })
    expect(encounterSelect().value).toBe('')

    fireEvent.change(screen.getByLabelText(/^registro$/i), {
      target: { value: 'Nota de retorno telefônico.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /salvar registro/i }))

    await waitFor(() =>
      expect(createRecordAction).toHaveBeenCalledWith(
        expect.objectContaining({ encounterId: '' }),
      ),
    )
  })
})

describe('a queixa principal acompanha a escolha', () => {
  it('aparece por extenso abaixo do campo, não só truncada na opção', async () => {
    /*
     * A opção do seletor é uma linha e trunca; o bloco não. Sem ele, uma queixa
     * longa chegaria pela metade a quem está escrevendo a evolução.
     */
    listPatientEncountersAction.mockResolvedValue({
      ok: true,
      data: [
        {
          ...openEncounter,
          chiefComplaint:
            'Dor lombar há três dias, com piora ao levantar peso e alívio em repouso',
        },
      ],
    })

    renderModal()
    selectPatient(PATIENT)

    await waitFor(() =>
      expect(screen.getByText(/alívio em repouso/i)).toBeTruthy(),
    )
    expect(screen.getByText(/queixa principal:/i)).toBeTruthy()
  })

  it('atendimento sem queixa diz que ninguém registrou', async () => {
    /*
     * Ausência de queixa é informação: quem escreve a evolução precisa saber
     * que o motivo clínico daquela consulta não foi registrado.
     */
    listPatientEncountersAction.mockResolvedValue({
      ok: true,
      data: [closedEncounter],
    })

    renderModal()
    selectPatient(PATIENT)

    await waitFor(() =>
      expect(screen.getByLabelText(/atendimento/i)).toBeTruthy(),
    )
    fireEvent.change(encounterSelect(), { target: { value: CLOSED_ENCOUNTER } })

    expect(
      screen.getByText(/nenhuma queixa principal foi registrada/i),
    ).toBeTruthy()
  })
})

describe('trocar de paciente não leva o vínculo junto', () => {
  it('a escolha anterior é descartada', async () => {
    /*
     * O defeito que isto impede: enviar o registro de Maria pendurado no
     * atendimento de João.
     */
    renderModal()
    selectPatient(PATIENT)

    await waitFor(() => expect(encounterSelect().value).toBe(OPEN_ENCOUNTER))

    listPatientEncountersAction.mockResolvedValue({ ok: true, data: [] })
    selectPatient(OTHER_PATIENT)

    await waitFor(() =>
      expect(listPatientEncountersAction).toHaveBeenLastCalledWith({
        patientId: OTHER_PATIENT,
      }),
    )

    fireEvent.change(screen.getByLabelText(/^registro$/i), {
      target: { value: 'Primeira consulta.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /salvar registro/i }))

    await waitFor(() =>
      expect(createRecordAction).toHaveBeenCalledWith(
        expect.objectContaining({
          patientId: OTHER_PATIENT,
          encounterId: '',
        }),
      ),
    )
  })
})

describe('o vínculo é enviado', () => {
  it('junto com paciente, tipo e conteúdo', async () => {
    renderModal()
    selectPatient(PATIENT)

    await waitFor(() => expect(encounterSelect().value).toBe(OPEN_ENCOUNTER))

    fireEvent.change(screen.getByLabelText(/^registro$/i), {
      target: { value: 'Conduta mantida.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /salvar registro/i }))

    await waitFor(() =>
      expect(createRecordAction).toHaveBeenCalledWith({
        patientId: PATIENT,
        encounterId: OPEN_ENCOUNTER,
        recordType: 'evolution',
        content: 'Conduta mantida.',
      }),
    )
  })
})

describe('quando a lista não carrega', () => {
  it('o registro continua podendo ser salvo, sem vínculo', async () => {
    // A falha é de contexto, não do registro: bloquear o salvamento faria uma
    // evolução já escrita se perder por causa de um seletor.
    listPatientEncountersAction.mockResolvedValue({
      ok: false,
      error: { code: 'unavailable', message: recordMessages.encountersUnavailable },
    })

    renderModal()
    selectPatient(PATIENT)

    await waitFor(() =>
      expect(screen.getByText(recordMessages.encountersUnavailable)).toBeTruthy(),
    )

    fireEvent.change(screen.getByLabelText(/^registro$/i), {
      target: { value: 'Evolução registrada.' },
    })
    fireEvent.click(screen.getByRole('button', { name: /salvar registro/i }))

    await waitFor(() =>
      expect(createRecordAction).toHaveBeenCalledWith(
        expect.objectContaining({ encounterId: '' }),
      ),
    )
  })
})

describe('a correção não escolhe atendimento', () => {
  it('não há seletor de vínculo no modo corrigir', () => {
    /*
     * O vínculo é herdado da versão anterior pelo servidor. Trocá-lo mudaria de
     * qual consulta o registro saiu — o que não é corrigir um texto.
     */
    renderModal({
      mode: 'amend',
      record: {
        id: '11111111-1111-4111-8111-111111111111',
        patientId: PATIENT,
        encounterId: OPEN_ENCOUNTER,
        encounter: openEncounter,
        authorId: 'a',
        authorName: 'Dra. Helena',
        recordType: 'evolution',
        content: 'Texto anterior.',
        version: 1,
        supersedesId: null,
        signedAt: null,
        createdAt: '2026-08-10T17:45:00.000Z',
      },
    })

    expect(screen.queryByLabelText(/atendimento/i)).toBeNull()
    expect(listPatientEncountersAction).not.toHaveBeenCalled()
  })
})
