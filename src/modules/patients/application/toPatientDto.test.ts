import { describe, expect, it } from 'vitest'

import type { Patient } from '@/modules/_shared/domain/types'

import { changedFields } from './changedFields'
import { toIsoDate, toPatientDto } from './toPatientDto'

function patient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: '9019956f-bdd8-4d61-868d-09b02332dad0',
    name: 'Maria Souza',
    email: 'maria@email.com',
    phone: '(11) 98812-4471',
    birthDate: new Date(1991, 2, 14),
    status: 'active',
    createdAt: new Date(2026, 7, 7, 14, 30),
    lastVisitAt: null,
    nextVisitAt: null,
    adminNotes: null,
    ...overrides,
  }
}

describe('toPatientDto', () => {
  it('nao deixa Date atravessar a fronteira da Server Action', () => {
    const dto = toPatientDto(patient())

    for (const value of Object.values(dto)) {
      expect(value).not.toBeInstanceOf(Date)
    }

    // O que sobrevive a serializacao e o que volta identico do JSON.
    expect(JSON.parse(JSON.stringify(dto))).toEqual(dto)
  })

  it('converte a data de nascimento no fuso local, sem voltar um dia', () => {
    // O bug classico: toISOString() em uma data montada a meia-noite no Brasil
    // devolve o dia anterior.
    expect(toPatientDto(patient()).birthDate).toBe('1991-03-14')
    expect(toIsoDate(new Date(2026, 0, 1))).toBe('2026-01-01')
    expect(toIsoDate(null)).toBeNull()
  })

  it('traduz status inativo em isActive falso', () => {
    expect(toPatientDto(patient()).isActive).toBe(true)
    expect(toPatientDto(patient({ status: 'inactive' })).isActive).toBe(false)
  })
})

describe('changedFields', () => {
  const current = patient({ adminNotes: 'vem acompanhada' })

  /** O estado atual, escrito na forma canonica que o schema produz. */
  const unchanged = {
    fullName: 'Maria Souza',
    phone: '11988124471',
    email: 'maria@email.com',
    birthDate: '1991-03-14',
    adminNotes: 'vem acompanhada',
    // P-01 completa: os cinco campos novos, na forma canonica do schema.
    socialName: null,
    phoneAlt: null,
    biologicalSex: 'not_informed' as const,
    genderIdentity: null,
    emergencyContact: null,
  }

  it('nao acusa mudanca quando nada mudou', () => {
    // Sem normalizar dos dois lados, telefone e nascimento apareceriam como
    // alterados em TODO save — a entidade carrega a forma de exibicao, a entrada
    // ja esta canonica.
    expect(changedFields(current, unchanged)).toEqual([])
  })

  it('aponta exatamente os campos alterados', () => {
    expect(
      changedFields(current, { ...unchanged, phone: '11911112222' }),
    ).toEqual(['phone'])

    expect(
      changedFields(current, {
        ...unchanged,
        fullName: 'Maria Souza Lima',
        email: null,
      }),
    ).toEqual(['name', 'email'])
  })

  it('trata apagar um campo como mudanca', () => {
    expect(changedFields(current, { ...unchanged, birthDate: null })).toEqual([
      'birth_date',
    ])

    expect(changedFields(current, { ...unchanged, adminNotes: null })).toEqual([
      'admin_notes',
    ])
  })

  it('so devolve nomes de coluna — nunca valores', () => {
    const changed = changedFields(current, {
      ...unchanged,
      fullName: 'Outro Nome',
      phone: '11911112222',
      email: 'outro@email.com',
    })

    const joined = changed.join(',')

    expect(joined).not.toContain('Outro Nome')
    expect(joined).not.toContain('11911112222')
    expect(joined).not.toContain('outro@email.com')
    expect(changed).toEqual(['name', 'phone', 'email'])
  })
})
