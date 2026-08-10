import { describe, expect, it } from 'vitest'

import {
  hasAnyItem,
  isExpired,
  orderItems,
  sortByIssuedAt,
} from './Prescription'

describe('itens', () => {
  it('prescrição sem item é receita em branco', () => {
    /*
     * Ela apareceria no histórico como "prescrição emitida" sem nada
     * prescrito — o tipo de registro que faz alguém concluir que houve
     * orientação.
     */
    expect(hasAnyItem([])).toBe(false)
    expect(hasAnyItem([{ drugName: 'Amoxicilina' }])).toBe(true)
  })

  it('a ordem é a que o profissional escreveu, não a alfabética', () => {
    /*
     * `sort_order` existe para isso: a sequência de uma receita é a que quem
     * prescreveu escolheu, e o paciente lê nela.
     */
    const ordered = orderItems([
      { id: 'c', sortOrder: 2 },
      { id: 'a', sortOrder: 0 },
      { id: 'b', sortOrder: 1 },
    ])

    expect(ordered.map((item) => item.id)).toEqual(['a', 'b', 'c'])
  })

  it('não muda a lista recebida', () => {
    const original = [
      { id: 'b', sortOrder: 1 },
      { id: 'a', sortOrder: 0 },
    ]

    orderItems(original)

    expect(original.map((item) => item.id)).toEqual(['b', 'a'])
  })
})

describe('ordem do histórico', () => {
  it('a última prescrição é a que vale hoje', () => {
    const ordered = sortByIssuedAt([
      { id: 'velha', issuedAt: '2026-01-01T10:00:00.000Z' },
      { id: 'nova', issuedAt: '2026-08-10T10:00:00.000Z' },
    ])

    expect(ordered.map((item) => item.id)).toEqual(['nova', 'velha'])
  })

  it('funciona com Date e com ISO', () => {
    const ordered = sortByIssuedAt([
      { id: 'a', issuedAt: new Date('2026-01-01T10:00:00.000Z') },
      { id: 'b', issuedAt: new Date('2026-08-10T10:00:00.000Z') },
    ])

    expect(ordered.map((item) => item.id)).toEqual(['b', 'a'])
  })
})

/**
 * Vencimento é COMPARAÇÃO DE DATA — nunca julgamento sobre o tratamento.
 *
 * Uma receita vencida pode estar sendo seguida com razão, e uma dentro do prazo
 * pode ter sido suspensa na consulta seguinte.
 */
describe('validade', () => {
  const agora = new Date('2026-08-10T12:00:00.000Z')

  it('data passada está vencida', () => {
    expect(isExpired(new Date('2026-08-09T12:00:00.000Z'), agora)).toBe(true)
  })

  it('data futura não está', () => {
    expect(isExpired(new Date('2026-09-01T12:00:00.000Z'), agora)).toBe(false)
  })

  it('sem validade declarada NÃO afirma vencimento', () => {
    /*
     * `null` é ausência de prazo declarado, e não "válida para sempre". A tela
     * não mostra selo nenhum nesse caso.
     */
    expect(isExpired(null, agora)).toBe(false)
  })

  it('o próprio instante do vencimento ainda não venceu', () => {
    expect(isExpired(agora, agora)).toBe(false)
  })
})
