import { describe, expect, it } from 'vitest'

import { hasRoom, limitReachedMessage, remaining } from './plan-limits'

/**
 * O limite do plano — a regra, sem banco.
 *
 * `plans.max_professionals` e `max_patients` eram exibidos em `/assinaturas` com
 * barra de uso e **nenhuma escrita os consultava**. Um SaaS cujo plano não
 * limita nada não tem plano.
 */

describe('cabe mais um?', () => {
  it('abaixo do teto, cabe', () => {
    expect(hasRoom({ max: 10, used: 9 })).toBe(true)
  })

  it('no teto, NÃO cabe', () => {
    /*
     * `used >= max`, e não `>`: com 10 de 10 usados, o próximo é o 11º. Errar o
     * sinal aqui deixaria todo plano entregar um a mais.
     */
    expect(hasRoom({ max: 10, used: 10 })).toBe(false)
  })

  it('acima do teto, não cabe', () => {
    // Estado herdado: a clínica pode ter estourado antes desta fatia existir.
    expect(hasRoom({ max: 10, used: 14 })).toBe(false)
  })

  it('sem teto, sempre cabe', () => {
    // `null` é ilimitado — e é diferente de zero, que trancaria a clínica.
    expect(hasRoom({ max: null, used: 9_999 })).toBe(true)
  })

  it('teto zero não deixa passar nada', () => {
    expect(hasRoom({ max: 0, used: 0 })).toBe(false)
  })
})

describe('quanto ainda cabe', () => {
  it('a diferença', () => {
    expect(remaining({ max: 10, used: 4 })).toBe(6)
  })

  it('nunca negativo', () => {
    /*
     * Mostrar "-4 disponíveis" transformaria um estado herdado — importação,
     * mudança de plano para baixo — em erro de cálculo aparente.
     */
    expect(remaining({ max: 10, used: 14 })).toBe(0)
  })

  it('sem teto devolve null, e não Infinity', () => {
    // `Infinity` viraria "∞ disponíveis" na tela por acidente de formatação.
    expect(remaining({ max: null, used: 3 })).toBeNull()
  })
})

/**
 * Quem lê esta frase costuma ser a recepção, que não decide plano nenhum.
 */
describe('a mensagem de limite atingido', () => {
  it('diz o número e o caminho de saída', () => {
    const message = limitReachedMessage('patients', 500)

    expect(message).toContain('500 pacientes')
    expect(message).toMatch(/assinaturas/i)
    expect(message).toMatch(/responsável/i)
  })

  it('concorda no singular', () => {
    // "1 pacientes" denuncia texto montado sem cuidado, e é o que a pessoa lê
    // no momento em que o sistema a impede de trabalhar.
    expect(limitReachedMessage('patients', 1)).toContain('1 paciente,')
    expect(limitReachedMessage('professionals', 1)).toContain('1 profissional ativo')
  })

  it('concorda no plural', () => {
    expect(limitReachedMessage('professionals', 3)).toContain(
      '3 profissionais ativos',
    )
  })

  it('distingue os dois recursos', () => {
    expect(limitReachedMessage('professionals', 10)).not.toContain('paciente')
    expect(limitReachedMessage('patients', 10)).not.toContain('profissional')
  })
})
