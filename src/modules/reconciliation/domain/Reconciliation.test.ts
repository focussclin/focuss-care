import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  BANK_TRANSACTION_STATUSES,
  canChangeStatusManually,
  divergenceCents,
  hasDivergence,
  MANUAL_STATUS_TRANSITIONS,
  targetKindFor,
} from './Reconciliation'

/**
 * As regras da conciliação que a tela precisa saber antes de desenhar o botão.
 *
 * Quem decide continua sendo o banco. O que mora aqui é o subconjunto que a
 * interface tem de conhecer para não oferecer uma ação que vai falhar — e os
 * testes do fim do arquivo leem o `.sql` para provar que os dois concordam.
 */

const MIGRATION = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260809_bank_reconciliation.sql'),
  'utf8',
)

describe('troca manual de status', () => {
  it('pendente pode ser ignorada, e ignorada volta para a fila', () => {
    /*
     * Tarifa, transferência entre contas da própria clínica e estorno duplicado
     * nunca vão casar com fatura ou despesa. Sem descarte, a fila de pendências
     * só cresce e o número no topo deixa de significar trabalho a fazer.
     */
    expect(canChangeStatusManually('pending', 'ignored')).toBe(true)
    expect(canChangeStatusManually('ignored', 'pending')).toBe(true)
  })

  it('conciliada não é escolhida à mão, em nenhum sentido', () => {
    /*
     * `reconciled` é consequência de `reconcile_bank_transaction`, que grava o
     * vínculo e muda o status na mesma transação. Escolhê-lo num menu diria que
     * a transação casou com alguma coisa sem existir linha em
     * `bank_reconciliations`; e ignorar uma já conciliada deixaria a evidência
     * de pé, apontando para uma transação que afirma não ter sido conciliada.
     */
    expect(MANUAL_STATUS_TRANSITIONS.reconciled).toEqual([])
    expect(canChangeStatusManually('pending', 'reconciled')).toBe(false)
    expect(canChangeStatusManually('reconciled', 'ignored')).toBe(false)
    expect(canChangeStatusManually('reconciled', 'pending')).toBe(false)
  })

  it('nenhum status transiciona para si mesmo', () => {
    for (const status of BANK_TRANSACTION_STATUSES) {
      expect(canChangeStatusManually(status, status), status).toBe(false)
    }
  })

  it('todo status do enum tem entrada na tabela', () => {
    // Um status novo sem entrada quebraria `MANUAL_STATUS_TRANSITIONS[from]`
    // dentro de um `.includes`, em runtime e sem mensagem útil.
    for (const status of BANK_TRANSACTION_STATUSES) {
      expect(MANUAL_STATUS_TRANSITIONS[status], status).toBeInstanceOf(Array)
    }
  })
})

describe('divergência de valor', () => {
  it('é a diferença entre o extrato e o registro interno', () => {
    expect(divergenceCents(50_000, 45_000)).toBe(5_000)
    expect(divergenceCents(45_000, 50_000)).toBe(-5_000)
  })

  it('valores iguais não divergem', () => {
    expect(hasDivergence(12_500, 12_500)).toBe(false)
    expect(divergenceCents(12_500, 12_500)).toBe(0)
  })

  it('divergência para menos conta tanto quanto para mais', () => {
    // Receber menos do que a fatura cobra é tão relevante quanto receber mais;
    // um sinal só serviria para esconder metade dos casos.
    expect(hasDivergence(45_000, 50_000)).toBe(true)
    expect(hasDivergence(50_000, 45_000)).toBe(true)
  })
})

describe('o sentido decide o alvo', () => {
  it('entrada casa com fatura, saída com despesa', () => {
    expect(targetKindFor('credit')).toBe('invoice')
    expect(targetKindFor('debit')).toBe('payable')
  })
})

describe('o domínio concorda com o banco', () => {
  it('os status são os aceitos pela constraint', () => {
    const constraint = /status text not null default 'pending'\s*check \(status in \(([^)]*)\)\)/.exec(MIGRATION)?.[1] ?? ''
    const doBanco = [...constraint.matchAll(/'(\w+)'/g)].map(([, status]) => status)

    expect(doBanco.length).toBeGreaterThan(0)
    expect([...BANK_TRANSACTION_STATUSES].sort()).toEqual([...doBanco].sort())
  })

  it('o banco confirma o par sentido/alvo que `targetKindFor` devolve', () => {
    /*
     * Se a regra do banco inverter e a tela não souber, todo vínculo passa a
     * falhar em `invoice_reconciliation_invalid` — um botão que nunca funciona.
     */
    expect(MIGRATION).toMatch(/if p_invoice_id is not null then\s+if v_transaction\.direction <> 'credit'/)
    expect(MIGRATION).toMatch(/else\s+if v_transaction\.direction <> 'debit'/)
  })

  it('só transação pendente é conciliável — a premissa dos botões', () => {
    expect(MIGRATION).toMatch(/if v_transaction\.status <> 'pending' then\s+raise exception 'bank_transaction_already_processed'/)
  })

  it('o valor casado é o CHEIO da transação, e não o da fatura', () => {
    /*
     * É a razão de o aviso de divergência existir. O banco não compara os dois
     * valores: ele grava o da transação e aceita o vínculo em silêncio.
     */
    expect(MIGRATION).toMatch(/matched_amount_cents[\s\S]{0,400}v_transaction\.amount_cents/)
  })

  it('a conciliação não tem UPDATE nem DELETE — por isso o aviso é antes', () => {
    /*
     * Um vínculo errado não se desfaz. Se algum dia existir policy de update ou
     * delete em `bank_reconciliations`, o aviso deixa de ser a última defesa e
     * este teste avisa que a decisão mudou.
     */
    const policies = [...MIGRATION.matchAll(/create policy "(bank_reconciliations_\w+)"/g)].map(([, nome]) => nome)

    expect(policies).toEqual(['bank_reconciliations_select', 'bank_reconciliations_insert'])
  })

  it('a função fixa o `search_path`, como todas as outras do produto', () => {
    /*
     * Era a única sem. Sem isso o caminho de resolução de nomes vem da sessão,
     * e `public.invoices` dentro do corpo passa a depender de quem chamou —
     * `function_search_path_mutable` no linter do Supabase.
     */
    const funcao = MIGRATION.slice(MIGRATION.indexOf('function public.reconcile_bank_transaction'))

    expect(funcao.slice(0, 900)).toMatch(/set search_path = public/)
  })
})
