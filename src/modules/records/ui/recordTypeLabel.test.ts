import { describe, expect, it } from 'vitest'

import { recordTypeOptions } from '../schemas/record.schema'
import { recordTypeLabel } from './recordTypeLabel'

describe('rótulo do tipo de registro', () => {
  it('traduz todo tipo que o formulário oferece', () => {
    for (const option of recordTypeOptions) {
      expect(recordTypeLabel(option.value)).toBe(option.label)
    }
  })

  it('tipo do banco fora do formulário aparece cru, e não some', () => {
    /*
     * `certificate` existe no enum `record_type` e o formulário não o oferece.
     * Um registro importado ou criado por outra via precisa continuar visível:
     * devolver string vazia aqui deixaria a linha da lista sem cabeçalho, e quem
     * lesse concluiria que não há registro daquele tipo.
     */
    expect(recordTypeLabel('certificate')).toBe('certificate')
    expect(recordTypeLabel('referral')).toBe('referral')
  })
})
