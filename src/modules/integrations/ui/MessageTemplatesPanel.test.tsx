// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { MessageTemplateDto } from '../schemas/messageTemplate.schema'
import { MessageTemplatesPanel } from './MessageTemplatesPanel'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const template: MessageTemplateDto = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Confirmação de consulta',
  category: 'Agendamento',
  language: 'pt-BR',
  body: 'Olá {{nome}}, sua consulta é {{data}}.',
  variables: ['nome', 'data'],
  isApproved: false,
  isActive: true,
}

afterEach(cleanup)

function renderPanel(
  overrides: Partial<React.ComponentProps<typeof MessageTemplatesPanel>> = {},
) {
  return render(
    <MessageTemplatesPanel
      templates={[template]}
      onSubmit={vi.fn().mockResolvedValue(null)}
      onSetActive={vi.fn().mockResolvedValue(null)}
      canManage
      isLive
      {...overrides}
    />,
  )
}

/**
 * A tela guarda texto. Ela não envia, e diz isso.
 */
describe('nada é enviado por aqui', () => {
  it('o aviso está no topo da biblioteca', () => {
    renderPanel()

    expect(screen.getByText(/Nada é enviado por aqui/i)).toBeTruthy()
  })

  it('não existe botão de enviar', () => {
    /*
     * Um botão de enviar sem provedor seria o interruptor falso que este
     * produto já removeu duas vezes.
     */
    renderPanel()

    expect(screen.queryByRole('button', { name: /enviar|disparar|mandar/i })).toBeNull()
  })

  it('o que a biblioteca entrega hoje é copiar', () => {
    renderPanel()

    expect(screen.getByRole('button', { name: /copiar texto/i })).toBeTruthy()
  })
})

/**
 * `is_approved` é preenchido por quem aprova modelo de mensagem — a Meta, no
 * caso do WhatsApp Business.
 */
describe('aprovação é do provedor, e somente leitura', () => {
  it('modelo novo aparece sem aprovação', () => {
    renderPanel()

    expect(screen.getByText('Sem aprovação de provedor')).toBeTruthy()
  })

  it('aprovado pelo provedor aparece como tal', () => {
    renderPanel({ templates: [{ ...template, isApproved: true }] })

    expect(screen.getByText('Aprovado pelo provedor')).toBeTruthy()
  })

  it('não há controle para marcar aprovação', () => {
    // Um interruptor aqui afirmaria uma aprovação que ninguém deu, e o erro só
    // apareceria no primeiro envio recusado.
    renderPanel()

    expect(screen.queryByRole('button', { name: /aprovar/i })).toBeNull()
    expect(screen.queryByLabelText(/aprovad/i)).toBeNull()
  })
})

describe('variáveis', () => {
  it('a lista aparece a partir do texto salvo', () => {
    renderPanel()

    expect(screen.getByText(/\{\{nome\}\}, \{\{data\}\}/)).toBeTruthy()
  })

  it('o formulário detecta ao vivo, sem campo para digitar', () => {
    /*
     * Não há campo de variáveis: uma lista escrita à mão divergiria do texto no
     * primeiro ajuste.
     */
    renderPanel({ templates: [] })

    fireEvent.click(screen.getByRole('button', { name: /novo modelo/i }))
    fireEvent.change(screen.getByLabelText('Texto'), {
      target: { value: 'Oi {{paciente}}, dia {{hora}}.' },
    })

    expect(screen.getByText(/\{\{paciente\}\}, \{\{hora\}\}/)).toBeTruthy()
    expect(screen.queryByLabelText(/variáveis/i)).toBeNull()
  })

  it('texto sem variável diz que sai como está', () => {
    renderPanel({ templates: [] })

    fireEvent.click(screen.getByRole('button', { name: /novo modelo/i }))
    fireEvent.change(screen.getByLabelText('Texto'), {
      target: { value: 'Sua consulta foi confirmada.' },
    })

    expect(screen.getByText(/exatamente como está escrito/i)).toBeTruthy()
  })
})

describe('cadastro', () => {
  it('envia nome, categoria e corpo', async () => {
    const onSubmit = vi.fn().mockResolvedValue(null)
    renderPanel({ templates: [], onSubmit })

    fireEvent.click(screen.getByRole('button', { name: /novo modelo/i }))
    fireEvent.change(screen.getByLabelText('Nome do modelo'), {
      target: { value: 'Lembrete' },
    })
    fireEvent.change(screen.getByLabelText('Texto'), {
      target: { value: 'Olá {{nome}}.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar modelo' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        { name: 'Lembrete', category: '', body: 'Olá {{nome}}.' },
        null,
      ),
    )
  })

  it('texto vazio não chega ao servidor', async () => {
    const onSubmit = vi.fn().mockResolvedValue(null)
    renderPanel({ templates: [], onSubmit })

    fireEvent.click(screen.getByRole('button', { name: /novo modelo/i }))
    fireEvent.change(screen.getByLabelText('Nome do modelo'), { target: { value: 'X' } })
    fireEvent.click(screen.getByRole('button', { name: 'Salvar modelo' }))

    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy())
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('editar carrega o que está gravado e manda o id', async () => {
    const onSubmit = vi.fn().mockResolvedValue(null)
    renderPanel({ onSubmit })

    fireEvent.click(screen.getByRole('button', { name: /editar/i }))
    expect((screen.getByLabelText('Nome do modelo') as HTMLInputElement).value).toBe(
      'Confirmação de consulta',
    )

    fireEvent.click(screen.getByRole('button', { name: 'Salvar modelo' }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.anything(), template.id),
    )
  })

  it('a recusa do servidor aparece dentro do modal', async () => {
    const onSubmit = vi.fn().mockResolvedValue('Já existe um modelo com este nome.')
    renderPanel({ onSubmit })

    fireEvent.click(screen.getByRole('button', { name: /editar/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Salvar modelo' }))

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toMatch(/já existe um modelo/i),
    )
  })
})

describe('permissão e falhas', () => {
  it('sem `clinic.settings` não escreve, mas ainda copia', () => {
    /*
     * Copiar é leitura: quem atende precisa do texto mesmo sem poder alterá-lo.
     */
    renderPanel({ canManage: false })

    expect(screen.queryByRole('button', { name: /editar/i })).toBeNull()
    expect(screen.getByRole('button', { name: /novo modelo/i }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('button', { name: /copiar texto/i })).toBeTruthy()
  })

  it('desativar manda o oposto do estado atual', async () => {
    const onSetActive = vi.fn().mockResolvedValue(null)
    renderPanel({ onSetActive })

    fireEvent.click(screen.getByRole('button', { name: /desativar/i }))

    await waitFor(() => expect(onSetActive).toHaveBeenCalledWith(template.id, false))
  })

  it('modo demonstração não fabrica modelo', () => {
    renderPanel({ templates: [], isLive: false })

    expect(screen.getByText(/modo demonstração/i)).toBeTruthy()
  })

  it('falha de leitura aparece e bloqueia a escrita', () => {
    renderPanel({ templates: [], loadError: 'Não foi possível falar com o servidor agora.' })

    expect(screen.getByRole('alert').textContent).toContain('servidor')
    expect(screen.getByRole('button', { name: /novo modelo/i }).hasAttribute('disabled')).toBe(true)
  })
})
