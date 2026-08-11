import { describe, expect, it } from 'vitest'

import {
  createProfessionalSchema,
  professionalMessages,
  updateProfessionalSchema,
} from './professional.schema'

const valid = {
  displayName: 'Dra. Helena Alves',
  councilType: 'CRM',
  councilNumber: '12345',
  councilState: 'sp',
  specialties: 'Clínica geral, Cardiologia',
  defaultSlotMinutes: '30',
  userId: '',
}

function parse(overrides: Record<string, unknown> = {}) {
  return createProfessionalSchema.safeParse({ ...valid, ...overrides })
}

function firstIssue(result: ReturnType<typeof parse>, path: string) {
  if (result.success) return null
  return result.error.issues.find((issue) => issue.path[0] === path)?.message ?? null
}

describe('nome na agenda', () => {
  it('é obrigatório', () => {
    expect(firstIssue(parse({ displayName: ' ' }), 'displayName')).toBe(
      professionalMessages.nameRequired,
    )
  })

  it('perde o espaço das pontas', () => {
    const result = parse({ displayName: '  Dr. João  ' })

    expect(result.success && result.data.displayName).toBe('Dr. João')
  })
})

/**
 * O conselho é um conjunto. Meio conselho identifica menos que nenhum.
 */
describe('conselho', () => {
  it('os três juntos passam', () => {
    expect(parse().success).toBe(true)
  })

  it('os três em branco passam', () => {
    const result = parse({ councilType: '', councilNumber: '', councilState: '' })

    expect(result.success).toBe(true)
    expect(result.success && result.data.councilType).toBeNull()
  })

  it('sigla sem número é recusada', () => {
    expect(firstIssue(parse({ councilNumber: '' }), 'councilNumber')).toBe(
      professionalMessages.councilIncomplete,
    )
  })

  it('número sem estado é recusado', () => {
    expect(firstIssue(parse({ councilState: '' }), 'councilNumber')).toBe(
      professionalMessages.councilIncomplete,
    )
  })

  it('a UF sobe para maiúscula', () => {
    // 'sp' e 'SP' são o mesmo estado; guardar os dois duplicaria o mesmo dado.
    const result = parse({ councilState: 'sp' })

    expect(result.success && result.data.councilState).toBe('SP')
  })

  it('UF com mais de duas letras é recusada', () => {
    expect(firstIssue(parse({ councilState: 'São Paulo' }), 'councilState')).toBe(
      professionalMessages.councilStateInvalid,
    )
  })

  it('só aceita sigla do enum do banco', () => {
    // 'CRMV' é conselho de verdade e NÃO está em `council_type` — mandá-lo
    // faria o insert falhar no banco, longe do campo que o causou.
    expect(parse({ councilType: 'CRMV' }).success).toBe(false)
  })
})

describe('especialidades', () => {
  it('viram lista', () => {
    const result = parse()

    expect(result.success && result.data.specialties).toEqual([
      'Clínica geral',
      'Cardiologia',
    ])
  })

  it('vazio vira lista vazia, não nula', () => {
    // A coluna é `text[]` NOT NULL.
    const result = parse({ specialties: '' })

    expect(result.success && result.data.specialties).toEqual([])
  })

  it('repetida entra uma vez só', () => {
    const result = parse({ specialties: 'Ortopedia, ortopedia , Ortopedia' })

    expect(result.success && result.data.specialties).toEqual([
      'Ortopedia',
      'ortopedia',
    ])
  })

  it('vírgula sobrando não vira entrada em branco', () => {
    const result = parse({ specialties: 'Pediatria,,' })

    expect(result.success && result.data.specialties).toEqual(['Pediatria'])
  })

  it('mais de dez é recusado', () => {
    const many = Array.from({ length: 11 }, (_, index) => `Esp ${index}`).join(', ')

    expect(firstIssue(parse({ specialties: many }), 'specialties')).toBe(
      professionalMessages.specialtiesTooMany,
    )
  })
})

describe('duração padrão', () => {
  it('chega como texto do formulário e sai número', () => {
    const result = parse({ defaultSlotMinutes: '45' })

    expect(result.success && result.data.defaultSlotMinutes).toBe(45)
  })

  it.each(['0', '4', '241', '30,5'])('%s é recusado', (value) => {
    expect(parse({ defaultSlotMinutes: value }).success).toBe(false)
  })
})

/**
 * O `select` manda `''` quando ninguém está escolhido — e "sem vínculo" é o
 * caso normal, não erro de preenchimento.
 */
describe('usuário vinculado', () => {
  it('vazio vira null', () => {
    const result = parse({ userId: '' })

    expect(result.success && result.data.userId).toBeNull()
  })

  it('ausente também vira null', () => {
    const result = parse({ userId: undefined })

    expect(result.success && result.data.userId).toBeNull()
  })

  it('texto que não é uuid é recusado', () => {
    expect(parse({ userId: 'admin' }).success).toBe(false)
  })
})

describe('edição', () => {
  it('exige o id do profissional', () => {
    expect(updateProfessionalSchema.safeParse(valid).success).toBe(false)
  })

  it('aplica a mesma regra de conselho da criação', () => {
    const result = updateProfessionalSchema.safeParse({
      professionalId: '11111111-1111-4111-8111-111111111111',
      ...valid,
      councilState: '',
    })

    expect(result.success).toBe(false)
  })
})

/**
 * `isActive` e `agendaColor` NÃO são campos do formulário.
 *
 * Desativar tira o profissional da agenda de toda a clínica: é ação própria,
 * com botão próprio. A cor fica de fora porque nenhuma tela a lê.
 */
describe('o que o formulário não aceita', () => {
  it('`isActive` enviado junto é descartado', () => {
    const result = parse({ isActive: false })

    expect(result.success).toBe(true)
    expect(result.success && 'isActive' in result.data).toBe(false)
  })

  it('`agendaColor` enviado junto é descartado', () => {
    const result = parse({ agendaColor: '#ff0000' })

    expect(result.success).toBe(true)
    expect(result.success && 'agendaColor' in result.data).toBe(false)
  })
})
