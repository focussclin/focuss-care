import { describe, expect, it, vi } from 'vitest'

import type { PatientRow } from '@/lib/supabase/database.types'

import { toPatient } from './patientMapper'

/**
 * A leitura do grupo documental.
 *
 * `patients.address` é `jsonb` NOT NULL e, até esta fatia, guardava `{}` em toda
 * linha da base. A releitura precisa distinguir três coisas que se parecem:
 * coluna vazia, endereço incompleto e conteúdo que não é endereço.
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

const fullAddress = {
  zip: '01310930',
  street: 'Avenida Paulista',
  number: '1578',
  complement: null,
  district: 'Bela Vista',
  city: 'São Paulo',
  state: 'SP',
}

describe('CPF e CNS', () => {
  it('chegam ao domínio como estão na coluna: dígitos', () => {
    const patient = toPatient(
      row({ cpf: '52998224725', cns: '123456789010000' }),
    )

    // A máscara é da tela. Formatar aqui faria a comparação de "mudou?" acusar
    // alteração em todo save.
    expect(patient.cpf).toBe('52998224725')
    expect(patient.cns).toBe('123456789010000')
  })

  it('coluna vazia vira null, e não string vazia', () => {
    const patient = toPatient(row())

    expect(patient.cpf).toBeNull()
    expect(patient.cns).toBeNull()
  })
})

describe('endereço', () => {
  it('é lido campo a campo', () => {
    const patient = toPatient(row({ address: fullAddress }))

    expect(patient.address).toEqual(fullAddress)
    expect(patient.addressUnreadable).toBe(false)
  })

  it('`{}` é SEM endereço, não conteúdo ilegível', () => {
    /*
     * É o estado de toda linha criada antes desta fatia — o insert gravava o
     * objeto vazio porque a coluna é NOT NULL. Tratá-lo como corrompido faria a
     * base inteira acusar um problema que não existe.
     */
    const patient = toPatient(row({ address: {} }))

    expect(patient.address).toBeNull()
    expect(patient.addressUnreadable).toBe(false)
  })

  it('objeto com todos os campos nulos também é sem endereço', () => {
    const patient = toPatient(
      row({
        address: {
          zip: null,
          street: null,
          number: null,
          complement: null,
          district: null,
          city: null,
          state: null,
        },
      }),
    )

    expect(patient.address).toBeNull()
    expect(patient.addressUnreadable).toBe(false)
  })

  it('conteúdo fora da forma NÃO vira "sem endereço" em silêncio', () => {
    /*
     * A coluna tem dado, e mostrar "sem endereço" sobre um endereço que existe é
     * mentira. O sinalizador deixa a ficha avisar que salvar vai substituí-lo.
     */
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const patient = toPatient(row({ address: { logradouro: 'Rua A' } }))

    expect(patient.address).toBeNull()
    expect(patient.addressUnreadable).toBe(true)

    spy.mockRestore()
  })

  it('UF fora da lista fechada torna a linha ilegível', () => {
    // Sigla inventada chegaria à etiqueta de correspondência e à guia.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const patient = toPatient(row({ address: { ...fullAddress, state: 'XX' } }))

    expect(patient.addressUnreadable).toBe(true)

    spy.mockRestore()
  })

  it('chave desconhecida junto de um endereço válido também é recusada', () => {
    /*
     * Sem `strict`, o excedente entraria no domínio sem validação — e é o sinal
     * de que a linha foi escrita por outra coisa.
     */
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const patient = toPatient(
      row({ address: { ...fullAddress, pais: 'Brasil' } }),
    )

    expect(patient.addressUnreadable).toBe(true)

    spy.mockRestore()
  })

  it('o texto do endereço nunca vai para o log', () => {
    // O log é lido por muito mais gente que a tabela, e endereço é dado pessoal.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    toPatient(row({ address: { rua: 'Avenida Paulista, 1578' } }))

    expect(JSON.stringify(spy.mock.calls)).not.toContain('Paulista')

    spy.mockRestore()
  })
})
