import { describe, expect, it } from 'vitest'

import { formatCents, parseCents } from './money'

/**
 * Dinheiro em centavos (B-01).
 *
 * Estes testes existem porque o modo de errar aqui é silencioso: um centavo
 * perdido na conversão não quebra tela nenhuma, só faz o caixa fechar com
 * diferença todo dia até alguém desconfiar do sistema inteiro.
 */

describe('parseCents', () => {
  it('entende as formas que uma recepção realmente digita', () => {
    expect(parseCents('150')).toBe(15000)
    expect(parseCents('150,00')).toBe(15000)
    expect(parseCents('150.00')).toBe(15000)
    expect(parseCents('R$ 1.234,56')).toBe(123456)
    expect(parseCents('1234,5')).toBe(123450)
  })

  it('trata ponto como milhar quando o grupo final tem três dígitos', () => {
    // '1.234' e mil duzentos e trinta e quatro; '12.34' e doze e trinta e
    // quatro. E a mesma heuristica que planilha usa.
    expect(parseCents('1.234')).toBe(123400)
    expect(parseCents('12.34')).toBe(1234)
  })

  it('devolve NULL para o que não dá para entender — e null não é zero', () => {
    // Aceitar ilegivel como zero registraria um pagamento de nada como se
    // fosse um pagamento.
    expect(parseCents('')).toBeNull()
    expect(parseCents('   ')).toBeNull()
    expect(parseCents('abc')).toBeNull()
    expect(parseCents('R$')).toBeNull()
  })

  it('recusa mais de duas casas decimais', () => {
    // Nao e dinheiro: e digitacao errada, e arredondar decidiria por quem
    // digitou.
    expect(parseCents('10,123')).toBeNull()
  })

  it('não perde centavo em valor com dízima conhecida do ponto flutuante', () => {
    // 0.1 + 0.2 em ponto flutuante da 0.30000000000000004. A conversao aqui e
    // por texto, entao o resultado e exato.
    expect(parseCents('0,10')! + parseCents('0,20')!).toBe(30)
    expect(parseCents('1234,56')).toBe(123456)
  })

  it('preserva o sinal negativo', () => {
    expect(parseCents('-50,00')).toBe(-5000)
  })
})

describe('formatCents', () => {
  it('formata em real brasileiro', () => {
    // O espaco entre 'R$' e o numero e um NBSP no Intl do pt-BR.
    expect(formatCents(15000).replace(/ /g, ' ')).toBe('R$ 150,00')
    expect(formatCents(0).replace(/ /g, ' ')).toBe('R$ 0,00')
    expect(formatCents(-2550).replace(/ /g, ' ')).toBe('-R$ 25,50')
  })

  it('vai e volta sem perder valor', () => {
    for (const cents of [1, 99, 100, 12345, 999999]) {
      expect(parseCents(formatCents(cents))).toBe(cents)
    }
  })
})
