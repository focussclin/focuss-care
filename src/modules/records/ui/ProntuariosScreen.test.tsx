// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { MedicalRecordDto } from '../schemas/record.schema'
import { ProntuariosScreen } from './ProntuariosScreen'

/**
 * O prontuário passa a dizer de qual consulta cada registro saiu.
 *
 * A queixa principal existia em `encounters.chief_complaint` desde a fatia
 * anterior e não chegava a esta tela: a evolução era legível sem o motivo que a
 * originou.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

const listRecordVersionsAction = vi.fn()
vi.mock('../actions/listRecordVersions.action', () => ({
  listRecordVersionsAction: (input: unknown) =>
    listRecordVersionsAction(input),
}))

const PATIENT = '22222222-2222-4222-8222-222222222222'
const ENCOUNTER = '44444444-4444-4444-8444-444444444444'

afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
  listRecordVersionsAction.mockResolvedValue({ ok: true, data: [] })
})

function record(overrides: Partial<MedicalRecordDto> = {}): MedicalRecordDto {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    patientId: PATIENT,
    encounterId: null,
    encounter: null,
    authorId: '55555555-5555-4555-8555-555555555555',
    authorName: 'Dra. Helena',
    recordType: 'evolution',
    content: 'Conduta mantida, retorno em quinze dias.',
    version: 1,
    supersedesId: null,
    signedAt: null,
    createdAt: '2026-08-10T17:45:00.000Z',
    ...overrides,
  }
}

function renderScreen(
  records: readonly MedicalRecordDto[],
  overrides: { canWrite?: boolean; isLive?: boolean } = {},
) {
  render(
    <ProntuariosScreen
      records={records}
      patients={[{ id: PATIENT, name: 'João da Silva' }]}
      patientNames={{ [PATIENT]: 'João da Silva' }}
      canWrite
      isLive
      {...overrides}
    />,
  )
}

const linkedEncounter = {
  id: ENCOUNTER,
  status: 'closed' as const,
  startedAt: '2026-08-10T17:30:00.000Z',
  endedAt: '2026-08-10T18:10:00.000Z',
  professionalName: 'Dra. Helena',
  chiefComplaint: 'Dor lombar há três dias',
}

describe('o atendimento que originou o registro', () => {
  it('aparece com data, estado e profissional', () => {
    renderScreen([record({ encounterId: ENCOUNTER, encounter: linkedEncounter })])

    expect(screen.getByText(/atendimento de/i)).toBeTruthy()
    expect(screen.getByText(/encerrado/i)).toBeTruthy()
  })

  it('a queixa principal fica visível junto do registro', () => {
    // A queixa diz por que a pessoa veio; a evolução, o que foi feito. Ler a
    // conduta sem o motivo inverte a ordem em que quem atende pensa.
    renderScreen([record({ encounterId: ENCOUNTER, encounter: linkedEncounter })])

    expect(screen.getByText(/dor lombar há três dias/i)).toBeTruthy()
  })

  it('atendimento sem queixa não inventa uma linha vazia', () => {
    renderScreen([
      record({
        encounterId: ENCOUNTER,
        encounter: { ...linkedEncounter, chiefComplaint: null },
      }),
    ])

    expect(screen.getByText(/atendimento de/i)).toBeTruthy()
    expect(screen.queryByText(/queixa principal/i)).toBeNull()
  })
})

describe('registro sem vínculo', () => {
  it('não ganha bloco de atendimento nenhum', () => {
    // Nota de telefonema, resultado que chegou depois: nem todo registro nasce
    // dentro de uma consulta, e sugerir o contrário seria invenção.
    renderScreen([record()])

    expect(screen.queryByText(/atendimento de/i)).toBeNull()
    expect(screen.queryByText(/não pôde ser carregado/i)).toBeNull()
  })
})

describe('o histórico de versões', () => {
  it('é oferecido em registro corrigido', () => {
    renderScreen([record({ version: 2 })])

    expect(screen.getByRole('button', { name: /ver histórico/i })).toBeTruthy()
  })

  it('não aparece na primeira versão', () => {
    renderScreen([record()])

    expect(screen.queryByRole('button', { name: /ver histórico/i })).toBeNull()
  })

  it('não depende de poder escrever', () => {
    /*
     * Ver as versões anteriores é `record.read` — a mesma permissão que abre
     * esta tela. Quem audita o prontuário raramente é quem o assina.
     */
    renderScreen([record({ version: 2 })], { canWrite: false })

    expect(screen.getByRole('button', { name: /ver histórico/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /corrigir/i })).toBeNull()
  })

  it('em demonstração não é oferecido', () => {
    // Sem sessão a action recusaria, e o erro diria que o produto está quebrado
    // quando ele só está sem banco.
    renderScreen([record({ version: 2 })], { isLive: false })

    expect(screen.queryByRole('button', { name: /ver histórico/i })).toBeNull()
  })

  it('abre pedindo a cadeia daquele registro', async () => {
    renderScreen([record({ version: 2 })])

    fireEvent.click(screen.getByRole('button', { name: /ver histórico/i }))

    await waitFor(() =>
      expect(listRecordVersionsAction).toHaveBeenCalledWith({
        recordId: record().id,
      }),
    )
  })
})

describe('vínculo que existe e não pôde ser lido', () => {
  it('é declarado, e não confundido com ausência de vínculo', () => {
    /*
     * `encounter` nulo com `encounterId` presente: a segunda consulta falhou ou
     * foi recusada. Dizer "sem vínculo" aqui seria afirmar o contrário do que a
     * linha do banco diz — e é o registro que menos pode mentir.
     */
    renderScreen([record({ encounterId: ENCOUNTER, encounter: null })])

    expect(screen.getByText(/não pôde ser carregado/i)).toBeTruthy()
  })
})
