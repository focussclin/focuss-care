import { describe, expect, it } from 'vitest'

import { quotaLevelOf } from '../domain/Subscription'
import type { SubscriptionOverview } from '../domain/Subscription'
import { toSubscriptionView } from './toSubscriptionView'

/**
 * A tradução do estado da assinatura para a tela.
 *
 * Duas coisas aqui são regra de negócio disfarçada de formatação:
 *
 *  - **qual data aparece.** Uma assinatura cancelada que anunciasse "período
 *    vigente até 01/09" prometeria uma renovação que não vai acontecer;
 *  - **limite nulo é ILIMITADO, não zero.** Trocar um pelo outro faz a tela
 *    dizer "limite atingido" para quem não tem limite.
 */

const PLAN = {
  id: 'plan-1',
  name: 'Clínica Plus',
  priceCents: 24_900,
  currency: 'BRL',
  maxProfessionals: 10,
  maxPatients: 1_000,
  storageMb: 5_000,
}

function overview(
  overrides: Partial<SubscriptionOverview['subscription']> = {},
  usage = { professionals: 3, patients: 120 },
): SubscriptionOverview {
  return {
    subscription: {
      id: 'sub-1',
      status: 'active',
      plan: PLAN,
      trialEndsAt: null,
      currentPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
      currentPeriodEnd: new Date('2026-09-01T00:00:00.000Z'),
      canceledAt: null,
      provider: null,
      ...overrides,
    } as SubscriptionOverview['subscription'],
    usage,
  }
}

describe('estado da assinatura', () => {
  it.each([
    ['active', 'Ativa', 'positive'],
    ['trialing', 'Em teste', 'attention'],
    ['past_due', 'Pagamento pendente', 'negative'],
    ['canceled', 'Cancelada', 'neutral'],
    ['incomplete', 'Contratação incompleta', 'attention'],
  ])('%s vira "%s"', (status, label, tone) => {
    const view = toSubscriptionView(
      overview({ status: status as never }),
    )

    expect(view.plan?.statusLabel).toBe(label)
    expect(view.plan?.statusTone).toBe(tone)
  })

  it('"pagamento pendente" não diz "vencida" — a assinatura ainda vale', () => {
    const view = toSubscriptionView(overview({ status: 'past_due' }))

    expect(view.plan?.statusLabel).not.toMatch(/vencid/i)
  })
})

describe('qual data a tela mostra', () => {
  it('em teste, mostra quando o teste acaba', () => {
    const view = toSubscriptionView(
      overview({
        status: 'trialing',
        trialEndsAt: new Date('2026-08-20T00:00:00.000Z'),
      }),
    )

    expect(view.plan?.periodLabel).toMatch(/^Teste até/)
  })

  it('cancelada, mostra quando foi cancelada — e não uma renovação futura', () => {
    const view = toSubscriptionView(
      overview({
        status: 'canceled',
        canceledAt: new Date('2026-07-15T00:00:00.000Z'),
      }),
    )

    expect(view.plan?.periodLabel).toMatch(/^Cancelada em/)
    expect(view.plan?.periodLabel).not.toMatch(/vigente/)
  })

  it('ativa, mostra até quando o período vai', () => {
    const view = toSubscriptionView(overview())

    expect(view.plan?.periodLabel).toMatch(/^Período vigente até/)
  })

  it('sem data nenhuma, não inventa frase', () => {
    const view = toSubscriptionView(
      overview({ currentPeriodEnd: null, trialEndsAt: null }),
    )

    expect(view.plan?.periodLabel).toBeNull()
  })
})

describe('cotas', () => {
  it('conta o uso real contra o teto do plano', () => {
    const view = toSubscriptionView(
      overview({}, { professionals: 4, patients: 900 }),
    )

    expect(view.quotas).toEqual([
      {
        label: 'Profissionais ativos',
        used: 4,
        limit: 10,
        level: 'ok',
      },
      {
        label: 'Pacientes cadastrados',
        used: 900,
        limit: 1_000,
        level: 'near',
      },
    ])
  })

  it('sem assinatura, ainda conta o uso — e o teto some', () => {
    const view = toSubscriptionView({
      subscription: null,
      usage: { professionals: 2, patients: 40 },
    })

    expect(view.plan).toBeNull()
    expect(view.quotas.map((quota) => [quota.used, quota.limit])).toEqual([
      [2, null],
      [40, null],
    ])
  })

  it('preço vem formatado em reais, por mês', () => {
    const view = toSubscriptionView(overview())

    expect(view.plan?.price).toContain('249,00')
    expect(view.plan?.price).toMatch(/por mês$/)
  })
})

describe('nível da cota', () => {
  it.each([
    ['sem teto é sempre ok', 5, null, 'ok'],
    ['bem abaixo', 3, 10, 'ok'],
    ['a partir de 80% avisa', 8, 10, 'near'],
    ['no teto', 10, 10, 'reached'],
    ['acima do teto', 12, 10, 'reached'],
  ])('%s', (_label, used, limit, expected) => {
    expect(quotaLevelOf(used, limit as number | null)).toBe(expected)
  })

  it('teto zero é atingido, não ilimitado', () => {
    // `null` é "sem limite"; zero é "nenhum permitido". Trocar um pelo outro
    // faria um plano sem cota parecer um plano infinito.
    expect(quotaLevelOf(0, 0)).toBe('reached')
  })
})
