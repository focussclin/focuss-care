import { describe, expect, it } from 'vitest'

import {
  checkRateLimit,
  delayFor,
  LOGIN_RATE_LIMIT,
  registerFailure,
  retryAfterSeconds,
  type RateLimitConfig,
} from './rate-limit'

/**
 * A política de controle de taxa — sem relógio e sem armazenamento.
 *
 * Não havia nenhum controle no produto: `signInAction` aceitava tentativas na
 * velocidade da rede. Estes casos percorrem a curva inteira em milissegundos
 * simulados, que é o que a pureza do módulo compra.
 */

const config: RateLimitConfig = {
  freeAttempts: 3,
  baseDelayMs: 1_000,
  maxDelayMs: 8_000,
  resetAfterMs: 60_000,
}

describe('a curva do backoff', () => {
  it.each([0, 1, 2, 3])('%d falhas ainda não esperam', (failures) => {
    // Cobre quem errou o layout do teclado ou não viu o Caps Lock.
    expect(delayFor(failures, config)).toBe(0)
  })

  it('dobra a partir da primeira falha excedente', () => {
    /*
     * O expoente conta do excedente, não do total: com 3 livres, a 4ª espera
     * 1s. Contar do total faria a 4ª já cair perto do teto.
     */
    expect(delayFor(4, config)).toBe(1_000)
    expect(delayFor(5, config)).toBe(2_000)
    expect(delayFor(6, config)).toBe(4_000)
  })

  it('para de crescer no teto', () => {
    // Sem teto, uma dúzia de falhas viraria espera de dias.
    expect(delayFor(7, config)).toBe(8_000)
    expect(delayFor(40, config)).toBe(8_000)
  })

  it('a configuração do login é a que o produto usa', () => {
    expect(LOGIN_RATE_LIMIT.freeAttempts).toBe(5)
    expect(delayFor(6, LOGIN_RATE_LIMIT)).toBe(1_000)
    expect(delayFor(99, LOGIN_RATE_LIMIT)).toBe(LOGIN_RATE_LIMIT.maxDelayMs)
  })
})

describe('a decisão', () => {
  it('primeira tentativa sempre passa', () => {
    expect(checkRateLimit(undefined, 1_000, config)).toEqual({
      allowed: true,
      retryAfterMs: 0,
    })
  })

  it('dentro das tentativas livres, passa', () => {
    const state = { failures: 3, lastFailureAt: 1_000 }

    expect(checkRateLimit(state, 1_001, config).allowed).toBe(true)
  })

  it('excedeu e não esperou: recusa e diz quanto falta', () => {
    const state = { failures: 4, lastFailureAt: 1_000 }

    expect(checkRateLimit(state, 1_400, config)).toEqual({
      allowed: false,
      retryAfterMs: 600,
    })
  })

  it('esperou o suficiente: passa', () => {
    const state = { failures: 4, lastFailureAt: 1_000 }

    expect(checkRateLimit(state, 2_000, config).allowed).toBe(true)
  })

  it('o contador esquece sozinho', () => {
    /*
     * Bloqueio permanente viraria arma: quem soubesse o e-mail trancaria a conta
     * de fora, e o suporte seria o caminho do ataque.
     */
    const state = { failures: 50, lastFailureAt: 1_000 }

    expect(checkRateLimit(state, 1_000 + config.resetAfterMs, config).allowed).toBe(
      true,
    )
  })
})

describe('registro da falha', () => {
  it('a primeira falha começa em um', () => {
    expect(registerFailure(undefined, 1_000, config)).toEqual({
      failures: 1,
      lastFailureAt: 1_000,
    })
  })

  it('falhas seguidas somam', () => {
    const state = registerFailure({ failures: 2, lastFailureAt: 900 }, 1_000, config)

    expect(state.failures).toBe(3)
  })

  it('falha depois do esquecimento recomeça do zero', () => {
    // Quem errou uma vez de manhã não herda aquele backoff à noite.
    const state = registerFailure(
      { failures: 9, lastFailureAt: 1_000 },
      1_000 + config.resetAfterMs,
      config,
    )

    expect(state.failures).toBe(1)
  })
})

describe('o que a pessoa lê', () => {
  it('arredonda para cima', () => {
    /*
     * Para baixo produziria "tente em 0 segundos" para qualquer espera menor que
     * um segundo — e a tentativa seguinte seria recusada de novo.
     */
    expect(retryAfterSeconds(1)).toBe(1)
    expect(retryAfterSeconds(1_001)).toBe(2)
    expect(retryAfterSeconds(4_000)).toBe(4)
  })
})

/**
 * O cenário que a fatia existe para impedir.
 */
describe('força bruta ingênua', () => {
  it('vinte tentativas seguidas não passam de oito', () => {
    let state: ReturnType<typeof registerFailure> | undefined
    let now = 0
    let permitidas = 0

    for (let i = 0; i < 20; i += 1) {
      // O atacante tenta o mais rápido que consegue: 10ms entre tentativas.
      now += 10
      if (checkRateLimit(state, now, config).allowed) {
        permitidas += 1
        state = registerFailure(state, now, config)
      }
    }

    // 3 livres + as poucas que couberam nas primeiras esperas curtas.
    expect(permitidas).toBeLessThanOrEqual(8)
    expect(permitidas).toBeGreaterThanOrEqual(3)
  })
})
