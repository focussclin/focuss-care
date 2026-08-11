// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { EditPatientModal, type EditablePatient } from './EditPatientModal'

/**
 * Identificação e contato na edição — P-01 completa.
 *
 * O formulário guardava cinco campos e o adapter preenchia o resto com
 * constante: `biological_sex: 'not_informed'` em toda linha da base.
 *
 * O modal renderiza em portal do Radix — as buscas vão em `document.body`, que é
 * o que `screen` já usa.
 */

afterEach(cleanup)

function patient(overrides: Partial<EditablePatient> = {}): EditablePatient {
  return {
    id: '9019956f-bdd8-4d61-868d-09b02332dad0',
    name: 'João da Silva',
    phone: '(11) 98812-4471',
    email: 'joao@email.com',
    birthDate: '1991-03-14',
    adminNotes: '',
    isActive: true,
    socialName: '',
    biologicalSex: 'not_informed',
    genderIdentity: '',
    phoneAlt: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelationship: '',
    emergencyContactUnreadable: false,
    cpf: '',
    cns: '',
    addressZip: '',
    addressStreet: '',
    addressNumber: '',
    addressComplement: '',
    addressDistrict: '',
    addressCity: '',
    addressState: '',
    addressUnreadable: false,
    ...overrides,
  }
}

function renderModal(overrides: Partial<EditablePatient> = {}, onSubmit = vi.fn()) {
  onSubmit.mockResolvedValue(null)

  render(
    <EditPatientModal
      open
      onOpenChange={vi.fn()}
      patient={patient(overrides)}
      onSubmit={onSubmit}
      onToggleArchived={vi.fn().mockResolvedValue(null)}
    />,
  )

  return onSubmit
}

describe('os campos existem e chegam preenchidos', () => {
  it('carrega o que já está gravado', () => {
    renderModal({
      socialName: 'Joana',
      biologicalSex: 'female',
      genderIdentity: 'Mulher trans',
      phoneAlt: '(21) 99999-8888',
      emergencyContactName: 'Maria Mãe',
      emergencyContactPhone: '(11) 98812-4471',
      emergencyContactRelationship: 'Mãe',
    })

    expect(
      screen.getByLabelText<HTMLInputElement>(/nome social/i).value,
    ).toBe('Joana')
    // Lido pela opção marcada: o genérico de `getByLabelText` não aceita
    // `HTMLSelectElement` (o `HTMLElement` do testing-library é de outra lib DOM).
    expect(
      [...screen.getByLabelText(/sexo biológico/i).querySelectorAll('option')].find(
        (option) => option.selected,
      )?.value,
    ).toBe('female')
    expect(
      screen.getByLabelText<HTMLInputElement>(/identidade de gênero/i).value,
    ).toBe('Mulher trans')
    expect(
      screen.getByLabelText<HTMLInputElement>(/telefone alternativo/i).value,
    ).toBe('(21) 99999-8888')
    expect(
      screen.getByLabelText<HTMLInputElement>(/nome do contato/i).value,
    ).toBe('Maria Mãe')
  })

  it('os quatro valores de sexo biológico são oferecidos', () => {
    /*
     * Três eram inalcançáveis pela aplicação inteira — nenhuma tela os escrevia.
     */
    renderModal()

    const options = [
      ...screen.getByLabelText(/sexo biológico/i).querySelectorAll('option'),
    ].map((option) => option.getAttribute('value'))

    expect(options).toEqual(['not_informed', 'female', 'male', 'intersex'])
  })

  it('sexo biológico e identidade de gênero são campos SEPARADOS', () => {
    /*
     * O schema já os separa, e a separação é correta: o primeiro tem uso
     * clínico, o segundo é autodeclaração. Colapsá-los daria um dado que não
     * serve para nenhum dos dois fins.
     */
    renderModal()

    expect(screen.getByLabelText(/sexo biológico/i).tagName).toBe('SELECT')
    expect(screen.getByLabelText(/identidade de gênero/i).tagName).toBe('INPUT')
  })
})

describe('envio', () => {
  it('manda os campos novos junto', async () => {
    const onSubmit = renderModal()

    fireEvent.change(screen.getByLabelText(/nome social/i), {
      target: { value: 'Joana' },
    })
    fireEvent.change(screen.getByLabelText(/sexo biológico/i), {
      target: { value: 'female' },
    })
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ socialName: 'Joana', biologicalSex: 'female' }),
      ),
    )
  })

  it('meio contato de emergência não chega ao servidor', async () => {
    /*
     * Nome sem telefone não permite avisar ninguém, e é numa emergência que
     * alguém vai procurar este campo. O servidor recusa também — aqui é só o
     * retorno rápido.
     */
    const onSubmit = renderModal()

    fireEvent.change(screen.getByLabelText(/nome do contato/i), {
      target: { value: 'Maria' },
    })
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => expect(onSubmit).not.toHaveBeenCalled())
  })

  it('telefone alternativo inválido é barrado antes do envio', async () => {
    const onSubmit = renderModal()

    fireEvent.change(screen.getByLabelText(/telefone alternativo/i), {
      target: { value: '123' },
    })
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => expect(onSubmit).not.toHaveBeenCalled())
  })
})

/**
 * A coluna é `jsonb` e aceita qualquer coisa. Conteúdo escrito fora do produto
 * não vira "sem contato" em silêncio.
 */
describe('contato gravado em formato desconhecido', () => {
  it('avisa que salvar vai substituí-lo', () => {
    renderModal({ emergencyContactUnreadable: true })

    // Por texto, e não por `role`: o modal já tem um `status` sr-only para
    // anunciar "Salvando alterações…", e `getByRole` acharia os dois.
    expect(screen.getByText(/vai substituí-lo/i)).toBeTruthy()
  })

  it('sem o problema, não há aviso nenhum', () => {
    renderModal()

    expect(screen.queryByText(/formato que o sistema não reconhece/i)).toBeNull()
  })
})

/**
 * O grupo documental na edição — CPF, CNS e endereço.
 *
 * As três colunas existiam desde o primeiro schema e nenhuma escrita do produto
 * as preenchia. O formulário é onde isso deixa de ser verdade.
 */
describe('documentos e endereço', () => {
  it('carregam preenchidos, em dígitos', () => {
    renderModal({
      cpf: '52998224725',
      cns: '123456789010000',
      addressZip: '01310930',
      addressStreet: 'Avenida Paulista',
      addressCity: 'São Paulo',
      addressState: 'SP',
    })

    // Dígitos, e não máscara: o campo é texto livre e o servidor normaliza de
    // novo ao salvar.
    expect(
      (screen.getByLabelText(/^cpf/i) as HTMLInputElement).value,
    ).toBe('52998224725')
    expect(
      (screen.getByLabelText(/logradouro/i) as HTMLInputElement).value,
    ).toBe('Avenida Paulista')
    expect(
      (screen.getByLabelText(/^uf$/i) as unknown as HTMLSelectElement).value,
    ).toBe('SP')
  })

  it('CPF que não fecha é barrado antes do envio', async () => {
    /*
     * A mesma checagem roda no servidor. Aqui ela evita a ida de rede e coloca o
     * erro no campo, que é onde o leitor de tela o associa.
     */
    const onSubmit = renderModal()

    fireEvent.change(screen.getByLabelText(/^cpf/i), {
      target: { value: '529.982.247-26' },
    })
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => expect(onSubmit).not.toHaveBeenCalled())
  })

  it('endereço pela metade é barrado', async () => {
    // Uma ficha com "apto 42" no lugar do endereço afirma que a pessoa tem
    // endereço cadastrado, e o balcão para de perguntar.
    const onSubmit = renderModal()

    fireEvent.change(screen.getByLabelText(/complemento/i), {
      target: { value: 'Apto 42' },
    })
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() => expect(onSubmit).not.toHaveBeenCalled())
  })

  it('endereço completo chega ao servidor', async () => {
    const onSubmit = renderModal()

    fireEvent.change(screen.getByLabelText(/logradouro/i), {
      target: { value: 'Avenida Paulista' },
    })
    fireEvent.change(screen.getByLabelText(/cidade/i), {
      target: { value: 'São Paulo' },
    })
    fireEvent.change(screen.getByLabelText(/^uf$/i), { target: { value: 'SP' } })
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }))

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          addressStreet: 'Avenida Paulista',
          addressCity: 'São Paulo',
          addressState: 'SP',
        }),
      ),
    )
  })

  it('endereço em formato desconhecido avisa que salvar substitui', () => {
    renderModal({ addressUnreadable: true })

    expect(screen.getByText(/endereço gravado num formato/i)).toBeTruthy()
  })

  it('o formulário declara que não consulta CEP em base externa', () => {
    // Sem isso, alguém digita o CEP e espera o resto aparecer sozinho.
    renderModal()

    expect(screen.getByText(/não é consultado em base externa/i)).toBeTruthy()
  })
})
