// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { AutomationRuleDto } from '../schemas/automation.schema'
import { AutomacoesScreen } from './AutomacoesScreen'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const rule: AutomationRuleDto = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Lembrar recepção',
  description: null,
  triggerType: 'appointment_reminder',
  triggerConfig: { kind: 'reminder', hoursBefore: 24 },
  conditions: [],
  actions: [{ type: 'notify_team', roles: ['receptionist'], message: 'Confirmar consulta' }],
  isActive: false,
  lastRunAt: null,
  updatedAt: '2026-08-10T10:00:00.000Z',
}

afterEach(cleanup)

function renderScreen(overrides: Partial<React.ComponentProps<typeof AutomacoesScreen>> = {}) {
  return render(
    <AutomacoesScreen
      status={{ rules: [], runs: 0 }}
      rules={[rule]}
      onSubmitRule={vi.fn().mockResolvedValue(null)}
      onToggleRule={vi.fn().mockResolvedValue(null)}
      onDeleteRule={vi.fn().mockResolvedValue(null)}
      canMutate
      {...overrides}
    />,
  )
}

/**
 * A tela cadastra de verdade — e diz, em toda parte, que nada executa.
 *
 * A versão anterior era só leitura, e justificava o vazio com "o cadastro entra
 * junto com o serviço que vai executá-las". O cadastro entrou; o serviço não.
 */
describe('a tela não promete execução', () => {
  it('o aviso de bloqueio continua no topo', () => {
    renderScreen()

    expect(screen.getByText(/nenhuma delas dispara/i)).toBeTruthy()
  })

  it('o selo diz "marcada como ativa", e não "ativa"', () => {
    /*
     * A diferença é a fatia inteira. "Ativa" faria a clínica confiar que o
     * lembrete está saindo — o defeito do interruptor falso que esta tela já
     * tinha removido uma vez.
     */
    renderScreen({ rules: [{ ...rule, isActive: true }] })

    expect(screen.getByText('Marcada como ativa')).toBeTruthy()
    expect(screen.queryByText(/^Ativa$/)).toBeNull()
  })

  it('o vazio convida a cadastrar sem prometer disparo', () => {
    renderScreen({ rules: [] })

    expect(screen.getByText('Nenhuma regra cadastrada.')).toBeTruthy()
    expect(screen.getByText(/até lá, nada dispara/i)).toBeTruthy()
  })

  it('regra nunca executada é dita como tal', () => {
    renderScreen()

    expect(screen.getByText('Nunca executada')).toBeTruthy()
  })
})

describe('cadastro', () => {
  it('monta a configuração do gatilho a partir do formulário', async () => {
    const onSubmitRule = vi.fn().mockResolvedValue(null)
    renderScreen({ onSubmitRule })

    fireEvent.click(screen.getAllByRole('button', { name: /nova regra/i })[0])
    fireEvent.change(screen.getByLabelText('Nome da regra'), { target: { value: 'Aviso de véspera' } })
    fireEvent.change(screen.getByLabelText('Antecedência em horas'), { target: { value: '48' } })
    fireEvent.change(screen.getByLabelText('Mensagem'), { target: { value: 'Confirmar amanhã' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar regra' }))

    await waitFor(() =>
      expect(onSubmitRule).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Aviso de véspera',
          triggerType: 'appointment_reminder',
          triggerConfig: { kind: 'reminder', hoursBefore: 48 },
          actions: [{ type: 'notify_team', roles: ['receptionist'], message: 'Confirmar amanhã' }],
        }),
        null,
      ),
    )
  })

  it('a regra nasce desligada', () => {
    // Cadastrar não é ligar, ainda mais quando ligar não liga nada.
    renderScreen()

    expect(screen.getByText('Desligada')).toBeTruthy()
  })

  it('o gatilho troca os campos de configuração', () => {
    renderScreen()

    fireEvent.click(screen.getAllByRole('button', { name: /nova regra/i })[0])
    expect(screen.getByLabelText('Antecedência em horas')).toBeTruthy()

    fireEvent.change(screen.getByLabelText('Gatilho'), { target: { value: 'appointment_created' } })
    expect(screen.queryByLabelText('Antecedência em horas')).toBeNull()
    expect(screen.queryByLabelText('Horário')).toBeNull()

    fireEvent.change(screen.getByLabelText('Gatilho'), { target: { value: 'schedule' } })
    expect(screen.getByLabelText('Horário')).toBeTruthy()
  })

  it('não oferece ação que sai da clínica', () => {
    /*
     * WhatsApp, e-mail e webhook dependem de adapter externo que não existe.
     * Oferecer a opção seria prometer um envio que nunca acontece.
     */
    renderScreen()

    fireEvent.click(screen.getAllByRole('button', { name: /nova regra/i })[0])
    const options = [...screen.getByLabelText('Ação').querySelectorAll('option')].map(
      (option) => option.getAttribute('value'),
    )

    expect(options).toEqual(['notify_team', 'create_task'])
  })

  it('mensagem vazia bloqueia o envio com aviso', async () => {
    const onSubmitRule = vi.fn().mockResolvedValue(null)
    renderScreen({ onSubmitRule })

    fireEvent.click(screen.getAllByRole('button', { name: /nova regra/i })[0])
    fireEvent.change(screen.getByLabelText('Nome da regra'), { target: { value: 'Sem mensagem' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar regra' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(onSubmitRule).not.toHaveBeenCalled()
  })

  it('edição carrega o que está gravado', () => {
    renderScreen()

    fireEvent.click(screen.getByRole('button', { name: /editar/i }))

    expect((screen.getByLabelText('Nome da regra') as HTMLInputElement).value).toBe('Lembrar recepção')
    expect((screen.getByLabelText('Antecedência em horas') as HTMLInputElement).value).toBe('24')
  })
})

describe('ativar, desativar e excluir', () => {
  it('marca como ativa mandando o oposto do estado atual', async () => {
    const onToggleRule = vi.fn().mockResolvedValue(null)
    renderScreen({ onToggleRule })

    fireEvent.click(screen.getByRole('button', { name: /marcar como ativa/i }))

    await waitFor(() => expect(onToggleRule).toHaveBeenCalledWith(rule.id, true))
  })

  it('excluir passa por confirmação', async () => {
    const onDeleteRule = vi.fn().mockResolvedValue(null)
    renderScreen({ onDeleteRule })

    fireEvent.click(screen.getByRole('button', { name: /^excluir$/i }))
    expect(onDeleteRule).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Excluir regra' }))
    await waitFor(() => expect(onDeleteRule).toHaveBeenCalledWith(rule.id))
  })

  it('a recusa do banco aparece, e não some em silêncio', async () => {
    const onDeleteRule = vi
      .fn()
      .mockResolvedValue('Esta regra já tem execuções registradas e não pode ser excluída.')
    renderScreen({ onDeleteRule })

    fireEvent.click(screen.getByRole('button', { name: /^excluir$/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Excluir regra' }))

    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/execuções registradas/i))
  })

  it('sem permissão, nenhum controle de escrita aparece', () => {
    renderScreen({ canMutate: false })

    expect(screen.queryByRole('button', { name: /marcar como ativa/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /editar/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^excluir$/i })).toBeNull()
    expect(screen.getAllByRole('button', { name: /nova regra/i })[0].hasAttribute('disabled')).toBe(true)
  })
})

describe('falha de leitura', () => {
  it('mostra o erro em vez de fingir lista vazia', () => {
    renderScreen({ rules: [], loadError: 'Não foi possível falar com o servidor agora.' })

    expect(screen.getByRole('alert').textContent).toContain('servidor')
  })
})
