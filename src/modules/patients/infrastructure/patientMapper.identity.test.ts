import { describe, expect, it, vi } from 'vitest'

import type { PatientRow } from '@/lib/supabase/database.types'

import { toPatient } from './patientMapper'

/**
 * A releitura de `patients.emergency_contact` — P-01 completa.
 *
 * A coluna é `jsonb` e aceita qualquer coisa. Confiar no que vier de lá deixaria
 * uma linha escrita fora do produto virar um objeto com o formato errado dentro
 * do domínio, e o erro apareceria três camadas adiante, na tela.
 */

function row(overrides: Partial<PatientRow> = {}): PatientRow {
  return {
    id: '9019956f-bdd8-4d61-868d-09b02332dad0',
    clinic_id: '7e3b0000-0000-4000-8000-00000000b48e',
    full_name: 'João da Silva',
    social_name: null,
    birth_date: '1991-03-14',
    biological_sex: 'not_informed',
    gender_identity: null,
    cpf: null,
    cns: null,
    phone: '11988124471',
    phone_alt: null,
    email: null,
    address: {},
    emergency_contact: null,
    photo_url: null,
    admin_notes: null,
    is_active: true,
    created_by: null,
    created_at: '2026-08-01T12:00:00.000Z',
    updated_at: '2026-08-01T12:00:00.000Z',
    deleted_at: null,
    ...overrides,
  } as PatientRow
}

describe('identificação', () => {
  it('traz nome social, sexo biológico e identidade de gênero', () => {
    const patient = toPatient(
      row({
        social_name: 'Joana',
        biological_sex: 'female',
        gender_identity: 'Mulher trans',
      }),
    )

    expect(patient.socialName).toBe('Joana')
    expect(patient.biologicalSex).toBe('female')
    expect(patient.genderIdentity).toBe('Mulher trans')
  })

  it('o telefone alternativo é formatado como o principal', () => {
    // A entidade carrega a forma de EXIBIÇÃO; o banco guarda só dígitos.
    const patient = toPatient(row({ phone_alt: '21999998888' }))

    expect(patient.phoneAlt).toBe('(21) 99999-8888')
  })

  it('sem telefone alternativo, string vazia — não `undefined` na tela', () => {
    expect(toPatient(row()).phoneAlt).toBe('')
  })
})

describe('contato de emergência bem formado', () => {
  it('atravessa inteiro', () => {
    const patient = toPatient(
      row({
        emergency_contact: {
          name: 'Maria Mãe',
          phone: '11988124471',
          relationship: 'Mãe',
        },
      }),
    )

    expect(patient.emergencyContact).toEqual({
      name: 'Maria Mãe',
      phone: '11988124471',
      relationship: 'Mãe',
    })
    expect(patient.emergencyContactUnreadable).toBe(false)
  })

  it('parentesco ausente vira null, e não `undefined`', () => {
    const patient = toPatient(
      row({ emergency_contact: { name: 'Maria', phone: '11988124471' } }),
    )

    expect(patient.emergencyContact?.relationship).toBeNull()
  })
})

describe('coluna sem contato', () => {
  it.each([
    ['nula', null],
    ['objeto vazio', {}],
  ])('%s não é dado ilegível', (_label, value) => {
    /*
     * `{}` é o que uma coluna "vazia" costuma guardar. Tratá-lo como ilegível
     * faria toda ficha sem contato exibir um aviso de formato inválido.
     */
    const patient = toPatient(row({ emergency_contact: value }))

    expect(patient.emergencyContact).toBeNull()
    expect(patient.emergencyContactUnreadable).toBe(false)
  })
})

/**
 * Conteúdo que não casa NÃO vira `null` em silêncio: a coluna tem dado, e
 * mostrar "sem contato" sobre um contato que existe é mentira.
 */
describe('coluna com formato desconhecido', () => {
  it.each([
    ['sem nome', { phone: '11988124471' }],
    ['nome vazio', { name: '   ', phone: '11988124471' }],
    ['chave estranha', { name: 'Maria', phone: '1', tipo: 'principal' }],
    ['texto solto', 'Maria - 11988124471'],
    ['lista', [{ name: 'Maria' }]],
  ])('%s é sinalizado, não engolido', (_label, value) => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    const patient = toPatient(row({ emergency_contact: value as never }))

    expect(patient.emergencyContact).toBeNull()
    expect(patient.emergencyContactUnreadable).toBe(true)
    expect(logged).toHaveBeenCalled()

    logged.mockRestore()
  })

  it('chave desconhecida NÃO passa junto', () => {
    /*
     * Sem `strict`, `{ name, phone, tipo: 'x' }` entraria e arrastaria conteúdo
     * não validado para dentro do domínio.
     */
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    const patient = toPatient(
      row({
        emergency_contact: {
          name: 'Maria',
          phone: '11988124471',
          observacao: 'ligar depois das 18h',
        } as never,
      }),
    )

    expect(patient.emergencyContact).toBeNull()
    logged.mockRestore()
  })
})
