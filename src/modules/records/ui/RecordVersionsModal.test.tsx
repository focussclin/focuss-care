// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * O append-only ficando visível.
 *
 * O módulo repetia em cinco arquivos que corrigir não reescreve, e nenhuma tela
 * mostrava as versões anteriores. O que se prova aqui é que elas aparecem
 * inteiras, na ordem, e que a tela não afirma nada quando a leitura falha.
 *
 * O modal renderiza em portal do Radix — as buscas vão em `document.body`, que é
 * o que `screen` já usa.
 */

const RECORD = '11111111-1111-4111-8111-111111111111'
const PREVIOUS = '33333333-3333-4333-8333-333333333333'
const PATIENT = '22222222-2222-4222-8222-222222222222'

const listRecordVersionsAction = vi.fn()
vi.mock('../actions/listRecordVersions.action', () => ({
  listRecordVersionsAction: (input: unknown) =>
    listRecordVersionsAction(input),
}))

const { RecordVersionsModal } = await import('./RecordVersionsModal')
const { recordMessages } = await import('../schemas/record.schema')

type ModalProps = React.ComponentProps<typeof RecordVersionsModal>
type RecordDto = NonNullable<ModalProps['record']>

function medicalRecord(overrides: Partial<RecordDto> = {}): RecordDto {
  return {
    id: RECORD,
    patientId: PATIENT,
    encounterId: null,
    encounter: null,
    authorId: '55555555-5555-4555-8555-555555555555',
    authorName: 'Dra. Helena',
    recordType: 'evolution',
    content: 'Segunda versão: conduta ajustada.',
    version: 2,
    supersedesId: PREVIOUS,
    signedAt: null,
    createdAt: '2026-08-11T09:00:00.000Z',
    ...overrides,
  }
}

const chain = [
  medicalRecord(),
  medicalRecord({
    id: PREVIOUS,
    version: 1,
    supersedesId: null,
    authorName: 'Dr. Paulo',
    content: 'Primeira versão: conduta inicial.',
    createdAt: '2026-08-10T17:45:00.000Z',
  }),
]

afterEach(cleanup)

beforeEach(() => {
  vi.clearAllMocks()
  listRecordVersionsAction.mockResolvedValue({ ok: true, data: chain })
})

function renderModal(overrides: Partial<ModalProps> = {}) {
  return render(
    <RecordVersionsModal
      open
      onOpenChange={vi.fn()}
      record={medicalRecord()}
      isLive
      {...overrides}
    />,
  )
}

describe('a cadeia inteira fica legível', () => {
  it('pede as versões do registro aberto', async () => {
    renderModal()

    await waitFor(() =>
      expect(listRecordVersionsAction).toHaveBeenCalledWith({
        recordId: RECORD,
      }),
    )
  })

  it('mostra o texto de cada versão, e não só o da vigente', async () => {
    /*
     * É o ponto da fatia: o que foi registrado antes da correção continua
     * legível. Sem isto, "não editamos, versionamos" era afirmação sem prova.
     */
    renderModal()

    await waitFor(() =>
      expect(screen.getByText('Primeira versão: conduta inicial.')).toBeTruthy(),
    )
    expect(screen.getByText('Segunda versão: conduta ajustada.')).toBeTruthy()
  })

  it('cada versão mostra quem a assinou', async () => {
    // A correção pode ser de outro profissional: a anterior continua assinada
    // por quem a escreveu.
    renderModal()

    await waitFor(() => expect(screen.getByText(/Dr\. Paulo/)).toBeTruthy())
    expect(screen.getByText(/Dra\. Helena/)).toBeTruthy()
  })

  it('diz qual delas vale hoje, em texto', async () => {
    /*
     * A ordem da lista responde, e contar só com ela deixaria a resposta na
     * disposição visual — a primeira coisa que se perde num leitor de tela.
     */
    renderModal()

    await waitFor(() => expect(screen.getByText('Versão vigente')).toBeTruthy())
    expect(screen.getByText('Versão 2')).toBeTruthy()
    expect(screen.getByText('Versão 1')).toBeTruthy()
  })

  it('declara que nada foi apagado', async () => {
    renderModal()

    expect(
      screen.getByText(/Nenhuma versão anterior é apagada ou alterada/i),
    ).toBeTruthy()
  })
})

describe('o que a tela NÃO faz', () => {
  it('não marca diferenças entre as versões', async () => {
    /*
     * Comparar evolução palavra a palavra e pintar o que mudou é leitura da
     * aplicação sobre conteúdo clínico — um destaque no lugar errado muda o
     * sentido do que se lê, e quem lê acredita no destaque.
     */
    renderModal()

    await waitFor(() =>
      expect(screen.getByText('Primeira versão: conduta inicial.')).toBeTruthy(),
    )

    expect(document.querySelector('ins')).toBeNull()
    expect(document.querySelector('del')).toBeNull()
    expect(document.querySelector('mark')).toBeNull()
  })

  it('não oferece restaurar nem apagar versão', () => {
    // Voltar a uma versão anterior é escrever uma nova — e é o que a correção
    // já faz. Um botão "restaurar" sugeriria que a cadeia anda para trás.
    renderModal()

    expect(
      screen.queryByRole('button', { name: /restaurar|reverter|excluir|apagar/i }),
    ).toBeNull()
  })
})

describe('estados', () => {
  it('anuncia o carregamento antes de afirmar qualquer coisa', () => {
    listRecordVersionsAction.mockReturnValue(new Promise(() => {}))

    renderModal()

    expect(screen.getByRole('status').textContent).toMatch(/carregando/i)
  })

  it('falha de leitura não vira "nunca foi corrigido"', async () => {
    /*
     * Uma lista vazia sobre um registro corrigido seria a afirmação mais errada
     * possível aqui: diria que a conduta sempre foi aquela.
     */
    listRecordVersionsAction.mockResolvedValue({
      ok: false,
      error: { code: 'unavailable', message: recordMessages.versionsUnavailable },
    })

    renderModal()

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(
        recordMessages.versionsUnavailable,
      ),
    )
  })

  it('em demonstração não pergunta ao servidor', () => {
    // A action recusaria por falta de sessão, e um erro vermelho diria que o
    // produto está quebrado quando ele só está sem banco.
    renderModal({ isLive: false })

    expect(listRecordVersionsAction).not.toHaveBeenCalled()
    expect(screen.getByRole('status').textContent).toMatch(/modo demonstração/i)
  })

  it('fechado não busca nada', () => {
    renderModal({ open: false })

    expect(listRecordVersionsAction).not.toHaveBeenCalled()
  })
})

describe('a cadeia de outro registro nunca fica na tela', () => {
  it('a resposta atrasada do primeiro é descartada', async () => {
    /*
     * Em prontuário, uma resposta fora de ordem não é um piscar de tela: é o
     * texto de uma pessoa aparecendo sob o cabeçalho do registro de outra.
     */
    const OTHER = '99999999-9999-4999-8999-999999999999'
    const first: { resolve?: (value: unknown) => void } = {}

    listRecordVersionsAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          first.resolve = resolve
        }),
    )

    const { rerender } = renderModal()

    listRecordVersionsAction.mockResolvedValue({
      ok: true,
      data: [
        medicalRecord({
          id: OTHER,
          version: 4,
          content: 'Registro de outro paciente.',
        }),
      ],
    })

    rerender(
      <RecordVersionsModal
        open
        onOpenChange={vi.fn()}
        record={medicalRecord({ id: OTHER, version: 4 })}
        isLive
      />,
    )

    await waitFor(() =>
      expect(screen.getByText('Registro de outro paciente.')).toBeTruthy(),
    )

    first.resolve?.({ ok: true, data: chain })

    await waitFor(() =>
      expect(screen.queryByText('Primeira versão: conduta inicial.')).toBeNull(),
    )
    expect(screen.getByText('Registro de outro paciente.')).toBeTruthy()
  })
})
