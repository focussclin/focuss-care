import { describe, expect, it } from 'vitest'

import {
  AUTHORIZATION_TRANSITIONS,
  canTransitionAuthorization,
  isAuthorizationExpired,
} from './Insurance'

/**
 * O ciclo da guia que faltava.
 *
 * O módulo alcançava três das seis situações do enum — `requested`, `approved`
 * e `denied`. Uma guia aprovada não tinha para onde ir: a lista de autorizadas
 * crescia para sempre, sem distinguir a já usada da que ainda vale, e sem forma
 * de desistir de um pedido que o paciente não voltou para fazer.
 */
describe('transições da guia', () => {
  it('aprovada pode ser baixada ou cancelada', () => {
    expect(canTransitionAuthorization('approved', 'used')).toBe(true)
    expect(canTransitionAuthorization('approved', 'canceled')).toBe(true)
  })

  it('pendente só pode ser cancelada — quem aprova é a operadora', () => {
    /*
     * Aprovar e negar exigem número ou motivo, e são a resposta da OPERADORA.
     * Deixá-los aqui abriria um caminho para marcar guia como autorizada sem
     * número nenhum.
     */
    expect(canTransitionAuthorization('requested', 'canceled')).toBe(true)
    expect(canTransitionAuthorization('requested', 'approved')).toBe(false)
    expect(canTransitionAuthorization('requested', 'denied')).toBe(false)
    expect(canTransitionAuthorization('requested', 'used')).toBe(false)
  })

  it('negada é final — contestar é a glosa, e pedir de novo é guia nova', () => {
    expect(AUTHORIZATION_TRANSITIONS.denied).toEqual([])
  })

  it('utilizada e cancelada não voltam', () => {
    expect(AUTHORIZATION_TRANSITIONS.used).toEqual([])
    expect(AUTHORIZATION_TRANSITIONS.canceled).toEqual([])
  })

  it('nenhum estado transiciona para si mesmo', () => {
    for (const status of Object.keys(AUTHORIZATION_TRANSITIONS) as (keyof typeof AUTHORIZATION_TRANSITIONS)[]) {
      expect(canTransitionAuthorization(status, status), status).toBe(false)
    }
  })

  it('todo estado do enum tem entrada na tabela', () => {
    // Estado sem entrada quebraria o `.includes` em runtime, sem mensagem útil.
    for (const status of [
      'requested',
      'approved',
      'denied',
      'used',
      'canceled',
      'expired',
    ] as const) {
      expect(AUTHORIZATION_TRANSITIONS[status], status).toBeInstanceOf(Array)
    }
  })

  it('`expired` não é destino de nada — a aplicação não o escreve', () => {
    /*
     * Gravá-lo exigiria um processo diário; sem ele, guia gravada como vencida
     * conviveria com outra vencida ainda marcada `approved`, e a lista mentiria
     * de duas formas.
     */
    for (const status of Object.keys(AUTHORIZATION_TRANSITIONS) as (keyof typeof AUTHORIZATION_TRANSITIONS)[]) {
      expect(AUTHORIZATION_TRANSITIONS[status], status).not.toContain('expired')
    }
  })
})

/**
 * Vencimento é comparação de data — nunca julgamento sobre usar a guia.
 */
describe('vencimento derivado', () => {
  const agora = new Date('2026-08-10T12:00:00.000Z')

  it('aprovada com prazo passado está vencida', () => {
    expect(isAuthorizationExpired('approved', new Date('2026-08-01T00:00:00.000Z'), agora)).toBe(true)
  })

  it('aprovada com prazo futuro não está', () => {
    expect(isAuthorizationExpired('approved', new Date('2026-09-01T00:00:00.000Z'), agora)).toBe(false)
  })

  it('sem prazo declarado não afirma vencimento', () => {
    expect(isAuthorizationExpired('approved', null, agora)).toBe(false)
  })

  it('só guia aprovada vence — as outras já terminaram', () => {
    /*
     * Negada, cancelada ou utilizada não "vencem": elas acabaram. Marcar
     * vencimento nelas encheria a lista de selo sem significado.
     */
    const passado = new Date('2026-08-01T00:00:00.000Z')

    for (const status of ['denied', 'canceled', 'used', 'requested'] as const) {
      expect(isAuthorizationExpired(status, passado, agora), status).toBe(false)
    }
  })
})
