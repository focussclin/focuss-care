import { describe, expect, it } from 'vitest'

import {
  BRAZILIAN_STATES,
  formatAddress,
  formatCns,
  formatCpf,
  formatZip,
  hasMinimumAddress,
  isBrazilianState,
  isValidCns,
  isValidCpf,
  isValidZip,
  onlyDigits,
} from './PatientDocuments'

/**
 * O grupo documental.
 *
 * A validação de dígito é a razão de este arquivo existir: CPF errado não é erro
 * de digitação inofensivo — ele viaja para a nota fiscal, para a guia do
 * convênio e para o pedido de exame, e a recusa chega quando o atendimento já
 * aconteceu.
 */

describe('CPF', () => {
  it('aceita CPF com dígito verificador correto', () => {
    // Números conhecidos como válidos pelo cálculo do módulo 11.
    expect(isValidCpf('52998224725')).toBe(true)
    expect(isValidCpf('11144477735')).toBe(true)
  })

  it('aceita com máscara — a máscara é da tela', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true)
  })

  it('recusa quando um dígito é trocado', () => {
    // O caso comum no balcão: alguém lê o documento e erra um número.
    expect(isValidCpf('52998224726')).toBe(false)
    expect(isValidCpf('52998224735')).toBe(false)
  })

  it('recusa sequência repetida, que PASSA no módulo 11', () => {
    /*
     * `111.111.111-11` fecha na conta e é inválido por definição da Receita.
     * Sem a recusa explícita, é exatamente o que alguém digita para pular o
     * campo.
     */
    expect(isValidCpf('11111111111')).toBe(false)
    expect(isValidCpf('00000000000')).toBe(false)
    expect(isValidCpf('99999999999')).toBe(false)
  })

  it('recusa comprimento errado', () => {
    expect(isValidCpf('5299822472')).toBe(false)
    expect(isValidCpf('529982247250')).toBe(false)
    expect(isValidCpf('')).toBe(false)
  })

  it('formata para exibição e devolve intacto o que não tem 11 dígitos', () => {
    expect(formatCpf('52998224725')).toBe('529.982.247-25')
    // Linha vinda de importação não pode ser mutilada pela tela.
    expect(formatCpf('123')).toBe('123')
  })
})

describe('CNS', () => {
  it('aceita cartão definitivo (começa com 1 ou 2)', () => {
    // Os 11 primeiros dígitos são o PIS; o fim do número sai dele.
    expect(isValidCns('123456789010000')).toBe(true)
    expect(isValidCns('200000000000003')).toBe(true)
  })

  it('aceita o cartão cujo dígito daria 10 — o ramo que termina em 001', () => {
    /*
     * Quando o cálculo devolve 10, o padrão manda somar 2 à ponderação e
     * recalcular, e o cartão passa a terminar em `001`. Sem este ramo, todo CNS
     * dessa família seria recusado — e não são poucos.
     */
    expect(isValidCns('123456789210018')).toBe(true)
  })

  it('aceita cartão provisório (começa com 7, 8 ou 9)', () => {
    /*
     * A família provisória tem regra PRÓPRIA: a soma ponderada dos 15 dígitos
     * precisa ser múltipla de 11. Tratar as duas como uma só recusaria metade
     * dos cartões reais — e cartão recusado no balcão vira "o sistema não
     * aceita", que é como um campo válido deixa de ser preenchido.
     */
    expect(isValidCns('700000000000005')).toBe(true)
    expect(isValidCns('700000000000000')).toBe(false)
  })

  it('recusa o definitivo com um dígito trocado', () => {
    expect(isValidCns('123456789010001')).toBe(false)
    expect(isValidCns('123456789110000')).toBe(false)
  })

  it('recusa início que não é 1, 2, 7, 8 ou 9', () => {
    expect(isValidCns('300000000000000')).toBe(false)
    expect(isValidCns('412345678901234')).toBe(false)
  })

  it('recusa comprimento diferente de 15', () => {
    expect(isValidCns('12345678901234')).toBe(false)
    expect(isValidCns('1234567890123456')).toBe(false)
  })

  it('formata em quatro grupos', () => {
    expect(formatCns('123456789012345')).toBe('123 4567 8901 2345')
    expect(formatCns('123')).toBe('123')
  })
})

describe('CEP e UF', () => {
  it('CEP é oito dígitos, com ou sem traço', () => {
    expect(isValidZip('01310930')).toBe(true)
    expect(isValidZip('01310-930')).toBe(true)
    expect(isValidZip('0131093')).toBe(false)
  })

  it('formata o CEP', () => {
    expect(formatZip('01310930')).toBe('01310-930')
  })

  it('a lista de UF tem as 27 unidades federativas', () => {
    expect(BRAZILIAN_STATES).toHaveLength(27)
    expect(isBrazilianState('SP')).toBe(true)
    expect(isBrazilianState('sp')).toBe(true)
    // Sigla inventada chegaria à etiqueta e à guia do convênio.
    expect(isBrazilianState('XX')).toBe(false)
  })
})

describe('endereço', () => {
  const address = {
    zip: '01310930',
    street: 'Avenida Paulista',
    number: '1578',
    complement: 'Conjunto 4',
    district: 'Bela Vista',
    city: 'São Paulo',
    state: 'SP',
  }

  it('o mínimo é rua, cidade e UF', () => {
    expect(hasMinimumAddress(address)).toBe(true)
    expect(hasMinimumAddress({ ...address, street: null })).toBe(false)
    expect(hasMinimumAddress({ ...address, city: null })).toBe(false)
    expect(hasMinimumAddress({ ...address, state: null })).toBe(false)
  })

  it('número NÃO entra no mínimo', () => {
    // "s/n" é endereço real em zona rural e em via antiga; cobrá-lo faria o
    // balcão inventar um número.
    expect(hasMinimumAddress({ ...address, number: null })).toBe(true)
  })

  it('monta a linha da ficha', () => {
    expect(formatAddress(address)).toBe(
      'Avenida Paulista, 1578, Conjunto 4 — Bela Vista · São Paulo · SP — CEP 01310-930',
    )
  })

  it('campo em branco some, e não vira travessão', () => {
    /*
     * Endereço com "—" no meio parece cadastro corrompido; o que falta
     * simplesmente não é dito.
     */
    const line = formatAddress({
      ...address,
      complement: null,
      district: null,
      zip: null,
    })

    expect(line).toBe('Avenida Paulista, 1578 — São Paulo · SP')
  })
})

describe('normalização', () => {
  it('só dígitos sobrevivem', () => {
    expect(onlyDigits('529.982.247-25')).toBe('52998224725')
    expect(onlyDigits(' 01310-930 ')).toBe('01310930')
    expect(onlyDigits('abc')).toBe('')
  })
})
