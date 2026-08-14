import { describe, expect, it } from 'vitest'

import {
  blocksService,
  outstandingCents,
  resolveVisitStage,
  type VisitCharge,
  type VisitInput,
} from './visit-stage'

/**
 * Os treze pontos do fluxo, derivados de três máquinas de estado que não os
 * conhecem.
 *
 * O que este arquivo protege, em ordem de importância:
 *
 *  1. **`draft` conta como dívida.** Toda fatura deste produto nasce `draft`,
 *     porque `issued` alegaria documento fiscal numerado. Se algum dia alguém
 *     "corrigir" isso tratando `draft` como rascunho, o portão de pagamento para
 *     de disparar para TODAS as faturas — em silêncio, com a tela dizendo que a
 *     regra está ativa.
 *  2. **A ordem das perguntas.** Terminal antes de financeiro, financeiro antes
 *     de "liberado".
 *  3. **Convênio não trava.** Quem paga é a operadora.
 */

function charge(overrides: Partial<VisitCharge> = {}): VisitCharge {
  return {
    status: 'draft',
    totalCents: 25_000,
    paidCents: 0,
    payerType: 'patient',
    ...overrides,
  }
}

function visit(overrides: Partial<VisitInput> = {}): VisitInput {
  return {
    appointment: { status: 'scheduled' },
    queue: null,
    encounter: null,
    charges: [],
    ...overrides,
  }
}

/** Chegou, está na fila, sem nada pago. */
function arrived(charges: readonly VisitCharge[] = []): VisitInput {
  return visit({
    appointment: { status: 'checked_in' },
    queue: { status: 'waiting' },
    charges,
  })
}

// ---------------------------------------------------------------------------

describe('quanto o paciente deve', () => {
  it('`draft` É dívida — é como toda fatura deste produto nasce', () => {
    /*
     * O teste mais importante do arquivo. `createInvoice` grava `status: 'draft'`
     * de propósito: `issued` significa documento fiscal numerado, e a numeração
     * pertence a uma RPC fora de alcance. Tratar `draft` como "ainda não cobrada"
     * faria o portão nunca disparar para nenhuma fatura real.
     */
    expect(outstandingCents([charge({ status: 'draft' })])).toBe(25_000)
  })

  it('cobrança cancelada não deve nada', () => {
    expect(outstandingCents([charge({ status: 'canceled' })])).toBe(0)
  })

  it('convênio não gera saldo de balcão', () => {
    // Quem paga é a operadora, pelo ciclo da guia. Travar o paciente por isso
    // pararia a operação inteira de quem atende convênio.
    expect(outstandingCents([charge({ payerType: 'insurance' })])).toBe(0)
  })

  it('soma pela diferença, e não pelo rótulo da fatura', () => {
    /*
     * `partially_paid` e `paid` são projeções de `payments`, e a projeção pode
     * estar atrás do fato. O dinheiro é a linha em `payments`.
     */
    expect(
      outstandingCents([
        charge({ status: 'paid', totalCents: 25_000, paidCents: 10_000 }),
      ]),
    ).toBe(15_000)
  })

  it('soma várias cobranças do mesmo paciente', () => {
    expect(
      outstandingCents([
        charge({ totalCents: 25_000, paidCents: 25_000 }),
        charge({ totalCents: 10_000, paidCents: 0 }),
      ]),
    ).toBe(10_000)
  })

  it('pagamento acima do total não vira crédito que esconde outra dívida', () => {
    expect(
      outstandingCents([
        charge({ totalCents: 25_000, paidCents: 40_000 }),
        charge({ totalCents: 10_000, paidCents: 0 }),
      ]),
    ).toBe(10_000)
  })

  it('sem cobrança, não deve nada', () => {
    expect(outstandingCents([])).toBe(0)
  })
})

describe('antes de chegar', () => {
  it('agendado', () => {
    expect(resolveVisitStage(visit())).toBe('scheduled')
  })

  it('confirmado', () => {
    expect(resolveVisitStage(visit({ appointment: { status: 'confirmed' } }))).toBe(
      'confirmed',
    )
  })

  it('fatura em aberto NÃO antecipa a cobrança de quem ainda não chegou', () => {
    // A tela de "aguardando pagamento" é a fila do caixa, e ela é presencial.
    expect(
      resolveVisitStage(visit({ charges: [charge()] })),
    ).toBe('scheduled')
  })
})

describe('chegou e deve', () => {
  it('sem nada pago é "aguardando pagamento"', () => {
    expect(resolveVisitStage(arrived([charge()]))).toBe('awaiting-payment')
  })

  it('com parte paga é "pagamento parcial", e não "pago"', () => {
    /*
     * A distinção existe para a recepção não liberar quem pagou metade — é o
     * item 12 do pedido, e a diferença entre os dois rótulos é a diferença entre
     * cobrar e não cobrar.
     */
    expect(
      resolveVisitStage(arrived([charge({ totalCents: 50_000, paidCents: 20_000 })])),
    ).toBe('partially-paid')
  })

  it('quem deve NÃO figura como liberado, mesmo já estando na fila', () => {
    /*
     * O ponto do pedido. `waiting_queue` diz "está na clínica"; quem decide se
     * pode ser chamado é esta função.
     */
    const stage = resolveVisitStage(
      visit({
        appointment: { status: 'checked_in' },
        queue: { status: 'waiting' },
        charges: [charge()],
      }),
    )

    expect(stage).not.toBe('awaiting-service')
    expect(stage).toBe('awaiting-payment')
  })

  it('já chamado, mas devendo, continua em cobrança', () => {
    expect(
      resolveVisitStage(
        visit({
          appointment: { status: 'checked_in' },
          queue: { status: 'called' },
          charges: [charge()],
        }),
      ),
    ).toBe('awaiting-payment')
  })
})

describe('chegou e está em dia', () => {
  it('pagou e está na fila: aguardando atendimento', () => {
    expect(
      resolveVisitStage(arrived([charge({ paidCents: 25_000 })])),
    ).toBe('awaiting-service')
  })

  it('pagou e ainda não entrou na fila: pago', () => {
    expect(
      resolveVisitStage(
        visit({
          appointment: { status: 'checked_in' },
          queue: null,
          charges: [charge({ paidCents: 25_000 })],
        }),
      ),
    ).toBe('paid')
  })

  it('sem cobrança nenhuma NÃO diz "pago"', () => {
    /*
     * Afirmar pagamento sobre quem nunca teve fatura seria a recepção lendo
     * "conferência feita" onde não houve conferência nenhuma.
     */
    expect(
      resolveVisitStage(
        visit({ appointment: { status: 'checked_in' }, queue: null }),
      ),
    ).toBe('checked-in')
  })

  it('sem cobrança e na fila, segue liberado — é o fluxo de hoje', () => {
    // Enquanto a recepção não emitir cobrança ligada ao agendamento, nada trava.
    expect(resolveVisitStage(arrived())).toBe('awaiting-service')
  })
})

describe('encaixe — chegou sem hora marcada', () => {
  it('sem agendamento, a fila sozinha responde', () => {
    expect(
      resolveVisitStage(visit({ appointment: null, queue: { status: 'waiting' } })),
    ).toBe('awaiting-service')
  })

  it('encaixe devendo também é barrado', () => {
    expect(
      resolveVisitStage(
        visit({
          appointment: null,
          queue: { status: 'waiting' },
          charges: [charge()],
        }),
      ),
    ).toBe('awaiting-payment')
  })
})

describe('em atendimento', () => {
  it('a fila em serviço manda', () => {
    expect(
      resolveVisitStage(
        visit({ appointment: { status: 'in_progress' }, queue: { status: 'in_service' } }),
      ),
    ).toBe('in-service')
  })

  it('cobrança que aparece durante a consulta não interrompe o atendimento', () => {
    /*
     * O procedimento adicional vira fatura enquanto a pessoa ainda está na sala.
     * Trocar o estado para "aguardando pagamento" no meio da consulta tiraria o
     * paciente da tela de quem está atendendo.
     */
    expect(
      resolveVisitStage(
        visit({
          appointment: { status: 'in_progress' },
          queue: { status: 'in_service' },
          charges: [charge()],
        }),
      ),
    ).toBe('in-service')
  })
})

describe('depois do atendimento', () => {
  it('sem saldo, finalizado', () => {
    expect(
      resolveVisitStage(
        visit({
          appointment: { status: 'completed' },
          encounter: { status: 'closed' },
          charges: [charge({ paidCents: 25_000 })],
        }),
      ),
    ).toBe('completed')
  })

  it('procedimento feito na hora vira "aguardando pagamento adicional"', () => {
    /*
     * Item 9 do pedido: a regra de pagamento antecipado vale para ENTRAR, não
     * para sair. Quem pagou R$ 250 antes e fez R$ 100 de procedimento durante
     * termina o atendimento e vai ao caixa.
     */
    expect(
      resolveVisitStage(
        visit({
          appointment: { status: 'completed' },
          encounter: { status: 'closed' },
          charges: [
            charge({ totalCents: 25_000, paidCents: 25_000 }),
            charge({ totalCents: 10_000, paidCents: 0 }),
          ],
        }),
      ),
    ).toBe('awaiting-extra-payment')
  })

  it('a fila encerrada basta, mesmo sem encontro aberto', () => {
    expect(
      resolveVisitStage(visit({ appointment: null, queue: { status: 'done' } })),
    ).toBe('completed')
  })
})

describe('terminais vêm antes de tudo', () => {
  it('cancelado com fatura em aberto NÃO vira cobrança na tela', () => {
    /*
     * Inverter a ordem cobraria na tela alguém que não vem — e a fatura de quem
     * cancelou se resolve no financeiro, não na fila da recepção.
     */
    expect(
      resolveVisitStage(
        visit({ appointment: { status: 'canceled' }, charges: [charge()] }),
      ),
    ).toBe('canceled')
  })

  it('falta é falta, mesmo com fila registrada', () => {
    expect(
      resolveVisitStage(
        visit({ appointment: { status: 'no_show' }, queue: { status: 'abandoned' } }),
      ),
    ).toBe('no-show')
  })
})

describe('o critério do portão é separado do rótulo da tela', () => {
  it('bloqueia com saldo', () => {
    expect(blocksService([charge()])).toBe(true)
  })

  it('libera sem saldo', () => {
    expect(blocksService([charge({ paidCents: 25_000 })])).toBe(false)
  })

  it('libera sem cobrança', () => {
    expect(blocksService([])).toBe(false)
  })

  it('não bloqueia por convênio', () => {
    expect(blocksService([charge({ payerType: 'insurance' })])).toBe(false)
  })

  it('bloqueia por pagamento parcial', () => {
    expect(blocksService([charge({ totalCents: 50_000, paidCents: 49_999 })])).toBe(
      true,
    )
  })
})
