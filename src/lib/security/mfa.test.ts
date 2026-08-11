import { describe, expect, it } from 'vitest'

import {
  activeFactors,
  hasSecondFactor,
  isFullyVerified,
  isValidTotpCode,
  normalizeTotpCode,
  pendingFactors,
  requiresSecondFactor,
  type EnrolledFactor,
} from './mfa'

/**
 * Segundo fator — a regra, sem cliente e sem rede.
 *
 * O produto guarda prontuário, prescrição e dado financeiro, e a única barreira
 * era senha. Com o controle de taxa a força bruta ficou cara; senha vazada em
 * outro serviço continuava valendo integralmente.
 */

/**
 * `currentLevel` é o que a sessão JÁ tem; `nextLevel` é o que ela PODE ter.
 * Confundi-los é o erro clássico do AAL.
 */
describe('quando exigir o segundo fator', () => {
  it('há fator cadastrado e a sessão não o apresentou', () => {
    expect(requiresSecondFactor({ currentLevel: 'aal1', nextLevel: 'aal2' })).toBe(
      true,
    )
  })

  it('já apresentou: não exige de novo', () => {
    // Tratar `nextLevel === 'aal2'` como "tem 2FA" sem comparar com o atual
    // mandaria para a tela de código quem acabou de passar por ela.
    expect(requiresSecondFactor({ currentLevel: 'aal2', nextLevel: 'aal2' })).toBe(
      false,
    )
  })

  it('conta sem fator cadastrado não exige nada', () => {
    expect(requiresSecondFactor({ currentLevel: 'aal1', nextLevel: 'aal1' })).toBe(
      false,
    )
  })

  it.each([
    ['sem nível atual', null, 'aal2'],
    ['sem próximo nível', 'aal1', null],
    ['sem nenhum', null, null],
  ])('%s NÃO tranca ninguém', (_label, currentLevel, nextLevel) => {
    /*
     * Nível nulo é leitura que falhou, ou provedor sem MFA habilitado. Exigir
     * código sem conseguir dizer qual fator trancaria a pessoa para fora por
     * causa de uma consulta indisponível.
     */
    expect(requiresSecondFactor({ currentLevel, nextLevel })).toBe(false)
  })
})

describe('sessão plenamente verificada', () => {
  it('quando os dois níveis coincidem', () => {
    expect(isFullyVerified({ currentLevel: 'aal2', nextLevel: 'aal2' })).toBe(true)
    expect(isFullyVerified({ currentLevel: 'aal1', nextLevel: 'aal1' })).toBe(true)
  })

  it('falso quando falta subir', () => {
    expect(isFullyVerified({ currentLevel: 'aal1', nextLevel: 'aal2' })).toBe(false)
  })

  it('desconhecido não vira alarme', () => {
    expect(isFullyVerified({ currentLevel: null, nextLevel: null })).toBe(true)
  })
})

function factor(overrides: Partial<EnrolledFactor> = {}): EnrolledFactor {
  return {
    id: '9019956f-bdd8-4d61-868d-09b02332dad0',
    friendlyName: 'Celular da Ana',
    status: 'verified',
    ...overrides,
  }
}

/**
 * Um `unverified` é enrolamento abandonado no meio: a pessoa gerou o QR e não
 * confirmou o código.
 */
describe('quais fatores contam como proteção', () => {
  it('só os verificados', () => {
    const factors = [factor(), factor({ id: 'b', status: 'unverified' })]

    expect(activeFactors(factors)).toHaveLength(1)
    expect(hasSecondFactor(factors)).toBe(true)
  })

  it('só pendentes NÃO é conta protegida', () => {
    /*
     * Contá-lo diria "sua conta tem 2FA" sobre um fator que ninguém consegue
     * usar — o pior desfecho possível numa tela de segurança.
     */
    const factors = [factor({ status: 'unverified' })]

    expect(hasSecondFactor(factors)).toBe(false)
  })

  it('sem fator nenhum', () => {
    expect(hasSecondFactor([])).toBe(false)
  })

  it('os pendentes ficam separados, para a tela poder limpá-los', () => {
    /*
     * Eles se acumulam: cada tentativa abandonada deixa um fator para trás, e o
     * provedor recusa nome repetido. Sem removê-los, quem errou o código uma vez
     * fica sem conseguir tentar de novo com o mesmo nome.
     */
    const factors = [factor(), factor({ id: 'b', status: 'unverified' })]

    expect(pendingFactors(factors).map((entry) => entry.id)).toEqual(['b'])
  })
})

describe('o código do autenticador', () => {
  it('aceita seis dígitos', () => {
    expect(isValidTotpCode('123456')).toBe(true)
  })

  it('espaço no meio não é erro da pessoa', () => {
    // Aplicativos e gerenciadores de senha copiam como "123 456".
    expect(normalizeTotpCode('123 456')).toBe('123456')
    expect(isValidTotpCode('123 456')).toBe(true)
  })

  it('descarta o que não é dígito', () => {
    expect(normalizeTotpCode('12-34-56')).toBe('123456')
  })

  it('corta o excedente em vez de recusar', () => {
    // Colar duas vezes é acidente comum; recusar mandaria apagar e digitar tudo.
    expect(normalizeTotpCode('123456789')).toBe('123456')
  })

  it.each(['', '12345', 'abcdef', '12 34'])('%s não é código', (raw) => {
    expect(isValidTotpCode(raw)).toBe(false)
  })
})
