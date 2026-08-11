import { describe, expect, it } from 'vitest'

import {
  canSign,
  councilIsComplete,
  formatCouncil,
  isValidSlot,
  sortProfessionals,
  type Professional,
} from './Professional'

function professional(overrides: Partial<Professional> = {}): Professional {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    userId: 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f',
    displayName: 'Dra. Helena Alves',
    councilType: 'CRM',
    councilNumber: '12345',
    councilState: 'SP',
    specialties: ['Clínica geral'],
    agendaColor: null,
    defaultSlotMinutes: 30,
    isActive: true,
    ...overrides,
  }
}

/**
 * Sigla, número e estado do conselho andam juntos.
 *
 * "CRM 12345" sem estado não identifica ninguém: o mesmo número existe em cada
 * unidade federativa.
 */
describe('conselho completo', () => {
  it('os três preenchidos', () => {
    expect(councilIsComplete('CRM', '12345', 'SP')).toBe(true)
  })

  it('nenhum preenchido também é válido', () => {
    // Quem atende sem conselho existe — e ainda assim é profissional da agenda.
    expect(councilIsComplete(null, null, null)).toBe(true)
  })

  it.each([
    ['sem estado', 'CRM' as const, '12345', null],
    ['sem número', 'CRM' as const, null, 'SP'],
    ['sem sigla', null, '12345', 'SP'],
  ])('%s é incompleto', (_label, type, number, state) => {
    expect(councilIsComplete(type, number, state)).toBe(false)
  })

  it('espaço em branco não conta como preenchido', () => {
    // '   ' passaria por um `!= null` ingênuo e gravaria um conselho vazio.
    expect(councilIsComplete('CRM', '   ', '  ')).toBe(false)
  })
})

describe('formatação do conselho', () => {
  it('monta sigla, número e estado', () => {
    expect(formatCouncil(professional())).toBe('CRM 12345/SP')
  })

  it('sem conselho, devolve null em vez de texto vazio', () => {
    expect(
      formatCouncil(
        professional({ councilType: null, councilNumber: null, councilState: null }),
      ),
    ).toBeNull()
  })
})

/**
 * Assinar exige as DUAS coisas: estar em operação e ter usuário vinculado.
 *
 * `current_professional_id()` resolve pelo usuário da sessão — sem `user_id`, a
 * função não encontra ninguém, e o prontuário fica sem autor.
 */
describe('quem assina', () => {
  it('ativo e vinculado assina', () => {
    expect(canSign(professional())).toBe(true)
  })

  it('sem usuário vinculado não assina', () => {
    expect(canSign(professional({ userId: null }))).toBe(false)
  })

  it('inativo não assina, mesmo vinculado', () => {
    expect(canSign(professional({ isActive: false }))).toBe(false)
  })
})

describe('duração padrão do encaixe', () => {
  it.each([5, 30, 240])('%d minutos é válido', (minutes) => {
    expect(isValidSlot(minutes)).toBe(true)
  })

  it.each([0, 4, 241, 30.5, Number.NaN])('%s não é', (minutes) => {
    // Fora da faixa é erro de digitação, não configuração exótica.
    expect(isValidSlot(minutes)).toBe(false)
  })
})

describe('ordenação da lista', () => {
  it('ativos vêm antes dos inativos', () => {
    const ordered = sortProfessionals([
      { isActive: false, displayName: 'Ana' },
      { isActive: true, displayName: 'Bruno' },
    ])

    expect(ordered.map((entry) => entry.displayName)).toEqual(['Bruno', 'Ana'])
  })

  it('dentro do grupo, alfabética com acento', () => {
    const ordered = sortProfessionals([
      { isActive: true, displayName: 'Ícaro' },
      { isActive: true, displayName: 'Alice' },
      { isActive: true, displayName: 'Ângela' },
    ])

    // 'Ângela' antes de 'Ícaro' só sai com colação pt-BR; ordem de code point
    // jogaria os dois para depois de 'Z'.
    expect(ordered.map((entry) => entry.displayName)).toEqual([
      'Alice',
      'Ângela',
      'Ícaro',
    ])
  })

  it('não altera o array recebido', () => {
    const original = [
      { isActive: false, displayName: 'Ana' },
      { isActive: true, displayName: 'Bruno' },
    ]

    sortProfessionals(original)

    expect(original[0].displayName).toBe('Ana')
  })
})
