import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  canTransition,
  isOpenOrder,
  PURCHASE_ORDER_STATUSES,
  PURCHASE_ORDER_TRANSITIONS,
  type PurchaseOrderStatus,
} from './Purchase'

/**
 * A máquina de estados do pedido de compra.
 *
 * # Duas fontes para a mesma regra
 *
 * Quem **decide** é `transition_purchase_order_status`, no banco. Esta tabela
 * decide o que a tela **oferece** — e as duas precisam concordar, senão a
 * interface mostra um botão que sempre falha.
 *
 * O último teste deste arquivo lê o SQL e compara. É a única coisa que impede
 * a cópia de envelhecer: sem ele, alguém acrescenta uma transição no banco, a
 * tela não a oferece, e ninguém descobre — ou pior, remove uma do banco e a
 * tela continua oferecendo.
 *
 * # O que a tabela consertou
 *
 * A tela tinha a própria versão das regras, num mapa de rótulos, e ela era
 * **linear**: `draft → requested → approved → ordered`. O banco sempre permitiu
 * voltar, e os dois caminhos que faltavam não são detalhe:
 *
 *  - `requested → draft` devolve para ajuste o pedido que chegou com a
 *    quantidade errada;
 *  - `approved → requested` retira a aprovação dada por engano.
 *
 * Sem eles, a única saída de um pedido com problema era cancelar e refazer,
 * perdendo o histórico de quem pediu o quê.
 */

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260809_purchases.sql'),
  'utf8',
)

describe('transições permitidas', () => {
  it('rascunho segue para solicitação, ou é cancelado', () => {
    expect(canTransition('draft', 'requested')).toBe(true)
    expect(canTransition('draft', 'cancelled')).toBe(true)
  })

  it('rascunho NÃO pula a aprovação', () => {
    // Aprovar sem alguém ter solicitado apagaria o passo em que a compra é
    // conferida — que é a razão de o fluxo existir.
    expect(canTransition('draft', 'approved')).toBe(false)
    expect(canTransition('draft', 'ordered')).toBe(false)
  })

  it('solicitado volta para rascunho — devolver para ajuste', () => {
    /*
     * O caminho que a tela não oferecia. Sem ele, um pedido que chega para
     * aprovação com a quantidade errada só sai por cancelamento — e o
     * histórico de quem pediu o quê vai junto.
     */
    expect(canTransition('requested', 'draft')).toBe(true)
  })

  it('aprovado volta para solicitado — retirar a aprovação', () => {
    expect(canTransition('approved', 'requested')).toBe(true)
  })

  it('enviado ao fornecedor só sai por cancelamento', () => {
    /*
     * `partially_received` e `received` NÃO são escolhidos na tela: a função de
     * recebimento os deriva da soma das quantidades. O estado do pedido é
     * consequência do que chegou na porta, não uma opção de menu.
     */
    expect(PURCHASE_ORDER_TRANSITIONS.ordered).toEqual(['cancelled'])
    expect(canTransition('ordered', 'received')).toBe(false)
    expect(canTransition('ordered', 'partially_received')).toBe(false)
  })

  it('estados finais não voltam', () => {
    for (const status of ['received', 'cancelled', 'partially_received'] as const) {
      expect(PURCHASE_ORDER_TRANSITIONS[status], status).toEqual([])
    }
  })

  it('nenhum estado transiciona para si mesmo', () => {
    // O banco trata isso como no-op; oferecer na tela seria um botão que não
    // faz nada.
    for (const status of PURCHASE_ORDER_STATUSES) {
      expect(canTransition(status, status), status).toBe(false)
    }
  })

  it('todo estado do enum tem entrada na tabela', () => {
    // Um estado novo sem entrada quebraria `PURCHASE_ORDER_TRANSITIONS[from]`
    // em runtime, dentro de um `.includes` — erro sem mensagem útil.
    for (const status of PURCHASE_ORDER_STATUSES) {
      expect(PURCHASE_ORDER_TRANSITIONS[status], status).toBeInstanceOf(Array)
    }
  })
})

describe('pedidos abertos', () => {
  it('recebido e cancelado não são trabalho aberto', () => {
    expect(isOpenOrder('received')).toBe(false)
    expect(isOpenOrder('cancelled')).toBe(false)
  })

  it('o resto ainda pede alguma coisa', () => {
    for (const status of ['draft', 'requested', 'approved', 'ordered', 'partially_received'] as const) {
      expect(isOpenOrder(status), status).toBe(true)
    }
  })
})

describe('a tabela concorda com o banco', () => {
  it('reproduz exatamente as transições do SQL', () => {
    /*
     * Lê a condição de `transition_purchase_order_status` e a compara com a
     * tabela. É o que impede a cópia de envelhecer nos dois sentidos: transição
     * nova no banco que a tela não oferece, e transição removida do banco que a
     * tela continua oferecendo — esta última virando um botão que sempre falha.
     *
     * O `match` é sobre a forma que a função usa hoje:
     *   (v_order.status = 'X' and v_next in ('A', 'B'))
     */
    const regras = [
      ...MIGRATION.matchAll(
        /v_order\.status = '(\w+)' and v_next (?:in \(([^)]*)\)|= '(\w+)')/g,
      ),
    ]

    expect(regras.length).toBeGreaterThan(0)

    const doBanco: Record<string, string[]> = {}

    for (const [, from, lista, unico] of regras) {
      doBanco[from] = (
        lista
          ? lista.split(',').map((item) => item.trim().replace(/'/g, ''))
          : [unico]
      ).filter(Boolean)
    }

    for (const [from, destinos] of Object.entries(doBanco)) {
      expect(
        [...PURCHASE_ORDER_TRANSITIONS[from as PurchaseOrderStatus]].sort(),
        from,
      ).toEqual([...destinos].sort())
    }
  })

  it('os estados da tabela são os do enum do banco', () => {
    const enumSql = MIGRATION.slice(
      MIGRATION.indexOf('create type public.purchase_order_status'),
    ).slice(0, 300)

    for (const status of PURCHASE_ORDER_STATUSES) {
      expect(enumSql, status).toContain(`'${status}'`)
    }
  })
})
