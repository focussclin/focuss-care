import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  INVENTORY_MOVEMENT_TYPES,
  needsRestock,
  stockLevelOf,
  type InventoryItem,
} from './Inventory'

/**
 * A situação do saldo, e a regra que ela consertou.
 *
 * `stockLevelOf` nasceu de uma duplicação: a tela decidia "abaixo do mínimo"
 * duas vezes, no KPI e no selo do cartão, e as duas cópias diziam
 * `atual <= mínimo`. Como `minimum_quantity` nasce `0` por padrão no banco —
 * conferido pelo último teste deste arquivo —, todo item recém-cadastrado,
 * ainda sem nenhuma entrada, aparecia em vermelho: `0 <= 0`. O alerta disparava
 * onde não havia mínimo definido para violar.
 */

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260809_inventory.sql'),
  'utf8',
)

function itemWith(patch: Partial<InventoryItem>): InventoryItem {
  return {
    id: 'i1',
    name: 'Luvas',
    sku: null,
    unit: 'caixa',
    minimumQuantity: 0,
    currentQuantity: 0,
    notes: null,
    isActive: true,
    updatedAt: new Date('2026-08-09T10:00:00.000Z'),
    ...patch,
  }
}

describe('situação do saldo', () => {
  it('item inativo não recebe julgamento de saldo', () => {
    // Ele saiu da operação; alarmar por um saldo que ninguém vai consumir só
    // esconde os itens que importam.
    expect(stockLevelOf(itemWith({ isActive: false, currentQuantity: 0 }))).toBe('inactive')
    expect(needsRestock(itemWith({ isActive: false, currentQuantity: 0 }))).toBe(false)
  })

  it('sem mínimo definido e sem saldo é SEM SALDO, não abaixo do mínimo', () => {
    /*
     * O defeito original. `0 <= 0` é verdade, então o item novo nascia
     * vermelho acusando violação de um mínimo igual a zero.
     */
    expect(stockLevelOf(itemWith({ minimumQuantity: 0, currentQuantity: 0 }))).toBe('out-of-stock')
  })

  it('sem mínimo definido mas com saldo é saudável', () => {
    expect(stockLevelOf(itemWith({ minimumQuantity: 0, currentQuantity: 1 }))).toBe('healthy')
  })

  it('saldo exatamente no mínimo já conta como abaixo', () => {
    // Chegar ao mínimo é o momento de repor, não o momento depois.
    expect(stockLevelOf(itemWith({ minimumQuantity: 5, currentQuantity: 5 }))).toBe('below-minimum')
    expect(stockLevelOf(itemWith({ minimumQuantity: 5, currentQuantity: 6 }))).toBe('healthy')
  })

  it('zerado com mínimo definido é SEM SALDO — o estado mais grave ganha', () => {
    expect(stockLevelOf(itemWith({ minimumQuantity: 5, currentQuantity: 0 }))).toBe('out-of-stock')
  })

  it('reposição cobre sem saldo e abaixo do mínimo, e só isso', () => {
    expect(needsRestock(itemWith({ minimumQuantity: 0, currentQuantity: 0 }))).toBe(true)
    expect(needsRestock(itemWith({ minimumQuantity: 5, currentQuantity: 5 }))).toBe(true)
    expect(needsRestock(itemWith({ minimumQuantity: 5, currentQuantity: 9 }))).toBe(false)
  })
})

describe('o domínio concorda com o banco', () => {
  it('os tipos de movimento são os aceitos pela constraint', () => {
    /*
     * Um tipo a mais aqui viraria `INVALID_MOVEMENT` na cara do usuário; um a
     * menos esconderia da tela um movimento que o banco grava.
     */
    const constraint = /movement_type in \(([^)]*)\)/.exec(MIGRATION)?.[1] ?? ''
    const doBanco = [...constraint.matchAll(/'(\w+)'/g)].map(([, tipo]) => tipo)

    expect(doBanco.length).toBeGreaterThan(0)
    expect([...INVENTORY_MOVEMENT_TYPES].sort()).toEqual([...doBanco].sort())
  })

  it('o mínimo realmente nasce zero — a premissa da regra acima', () => {
    /*
     * Se o banco passar a exigir um mínimo, "sem mínimo definido" deixa de
     * existir e `stockLevelOf` precisa ser revisto. Este teste é o alarme.
     */
    expect(MIGRATION).toMatch(/minimum_quantity integer not null default 0/)
  })

  it('o ajuste continua sendo entrada ou saída, e não um terceiro tipo', () => {
    /*
     * `set_inventory_quantity` decide a direção pelo sinal da diferença. Se
     * alguém trocar isso por um `movement_type` próprio, toda soma de saldo
     * passa a precisar de mais um `case` — e este teste quebra antes.
     */
    expect(MIGRATION).toMatch(/case when v_delta > 0 then 'in' else 'out' end/)
  })

  it('contagem igual ao saldo devolve null em vez de gravar movimento', () => {
    // `quantity > 0` proíbe o movimento de zero; devolver null é o que impede
    // a função de tentar gravá-lo.
    const corpo = MIGRATION.slice(MIGRATION.indexOf('v_delta := p_counted_quantity'))
    expect(corpo.slice(0, 200)).toMatch(/if v_delta = 0 then\s+return null;/)
  })

  it('a contagem grava o saldo apurado, não a soma da diferença', () => {
    /*
     * `current_quantity = p_counted_quantity` é o que torna a contagem
     * idempotente: repetir a mesma contagem não empilha ajuste em cima de
     * ajuste.
     */
    expect(MIGRATION).toMatch(/set current_quantity = p_counted_quantity/)
  })

  it('a diferença é calculada depois do lock, nunca antes', () => {
    /*
     * A ordem é a garantia inteira. `for update` precisa vir antes de
     * `v_delta :=`, senão duas contagens simultâneas leem o mesmo saldo velho e
     * a última sobrescreve a primeira.
     */
    const funcao = MIGRATION.slice(MIGRATION.indexOf('function public.set_inventory_quantity'))
    expect(funcao.indexOf('for update')).toBeLessThan(funcao.indexOf('v_delta :='))
  })
})
