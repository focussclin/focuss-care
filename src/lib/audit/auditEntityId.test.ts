import { describe, expect, it } from 'vitest'

import { isAuditEntityId } from './audit-log'

/**
 * `audit_log.entity_id` é `uuid` no banco.
 *
 * Este teste existe por causa de um defeito que só apareceu no log do servidor
 * de desenvolvimento: `/prontuarios` gravava a string `'all'` ali para dizer
 * "leu a lista, não um paciente". O Postgres recusava a linha inteira com
 * `22P02`, e como a auditoria é best-effort o evento sumia sem quebrar nada — a
 * leitura de prontuário simplesmente não era registrada.
 *
 * O tipo gerado não pega isso: `uuid` vira `string` em TypeScript, então
 * `'all'` compila. Só o banco recusa, em tempo de execução, e em silêncio.
 */

const UUID = '9019956f-bdd8-4d61-868d-09b02332dad0'

describe('isAuditEntityId', () => {
  it('aceita uuid, em qualquer caixa', () => {
    expect(isAuditEntityId(UUID)).toBe(true)
    expect(isAuditEntityId(UUID.toUpperCase())).toBe(true)
  })

  it('recusa a string que causou o defeito', () => {
    expect(isAuditEntityId('all')).toBe(false)
  })

  it('recusa texto que parece id mas não é uuid', () => {
    for (const value of [
      '',
      '   ',
      '123',
      'patient-1',
      // Um caractere a menos no ultimo grupo.
      '9019956f-bdd8-4d61-868d-09b02332dad',
      // Grupos certos, caractere invalido.
      '9019956f-bdd8-4d61-868d-09b02332dadg',
      // Sem hifens.
      '9019956fbdd84d61868d09b02332dad0',
    ]) {
      expect(isAuditEntityId(value)).toBe(false)
    }
  })

  it('recusa o que não é string', () => {
    // A fronteira e `unknown` na pratica: o evento vem de codigo de modulo.
    for (const value of [null, undefined, 0, 42, {}, [], true]) {
      expect(isAuditEntityId(value)).toBe(false)
    }
  })
})
