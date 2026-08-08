import { describe, expect, it } from 'vitest'

import { formatPhone, normalizePhone, toPhoneDigits } from './phone'

describe('normalizePhone', () => {
  it('reduz qualquer mascara a DDD + numero', () => {
    for (const raw of [
      '(11) 98812-4471',
      '11988124471',
      '11 9 8812 4471',
      '+55 11 98812-4471',
      '5511988124471',
    ]) {
      expect(normalizePhone(raw)).toBe('11988124471')
    }
  })

  it('aceita fixo de 10 digitos', () => {
    expect(normalizePhone('(11) 3822-4471')).toBe('1138224471')
  })

  it('devolve null para o que nao e telefone brasileiro', () => {
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone('988124471')).toBeNull() // sem DDD
    expect(normalizePhone('1198812447100')).toBeNull() // digitos demais
    expect(normalizePhone('abc')).toBeNull()
  })
})

describe('formatPhone', () => {
  it('formata celular e fixo', () => {
    expect(formatPhone('11988124471')).toBe('(11) 98812-4471')
    expect(formatPhone('1138224471')).toBe('(11) 3822-4471')
  })

  it('devolve intacto o valor fora do padrao', () => {
    // Linha vinda de importacao ou de cadastro antigo nao pode ser mutilada.
    expect(formatPhone('+1 415 555 0134')).toBe('+1 415 555 0134')
    expect(formatPhone('')).toBe('')
  })

  it('e estavel: formatar o que ja esta formatado nao muda nada', () => {
    expect(formatPhone(formatPhone('11988124471'))).toBe('(11) 98812-4471')
  })
})

describe('toPhoneDigits', () => {
  it('sobrevive a ida e volta entre as duas formas', () => {
    const canonical = '11988124471'

    expect(toPhoneDigits(formatPhone(canonical))).toBe(canonical)
  })
})
