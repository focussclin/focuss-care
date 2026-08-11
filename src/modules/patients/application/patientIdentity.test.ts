import { describe, expect, it } from 'vitest'

import type { Patient } from '@/modules/_shared/domain/types'

import { changedFields } from './changedFields'
import { toNewPatientData } from './toNewPatientData'

/**
 * Identificação e contato entre a action e o repositório — P-01 completa.
 *
 * Duas responsabilidades que o defeito silencioso mora: montar o contato de
 * emergência a partir de três campos soltos, e dizer QUAIS campos a edição
 * mudou (nunca os valores — `audit_log` é append-only e legível pela operação
 * inteira).
 */

const validated = {
  name: 'Maria Souza',
  phone: '11988124471',
  email: null,
  birthDate: null,
  notes: null,
  socialName: null,
  biologicalSex: 'not_informed' as const,
  genderIdentity: null,
  phoneAlt: null,
  emergencyContactName: null,
  emergencyContactPhone: null,
  emergencyContactRelationship: null,
  // Grupo documental — vazio por padrão, como sai de um cadastro de balcão.
  cpf: null,
  cns: null,
  addressZip: null,
  addressStreet: null,
  addressNumber: null,
  addressComplement: null,
  addressDistrict: null,
  addressCity: null,
  addressState: null,
}

describe('montagem do contato de emergência', () => {
  it('os três campos viram um objeto', () => {
    const data = toNewPatientData({
      ...validated,
      emergencyContactName: 'Maria Mãe',
      emergencyContactPhone: '11988124471',
      emergencyContactRelationship: 'Mãe',
    })

    expect(data.emergencyContact).toEqual({
      name: 'Maria Mãe',
      phone: '11988124471',
      relationship: 'Mãe',
    })
  })

  it('sem nome e telefone, o contato é null — e isso APAGA o gravado', () => {
    // Limpar os campos é edição legítima: contato errado numa emergência é pior
    // que nenhum.
    expect(toNewPatientData(validated).emergencyContact).toBeNull()
  })

  it('parentesco sozinho não cria contato', () => {
    const data = toNewPatientData({
      ...validated,
      emergencyContactRelationship: 'Mãe',
    })

    expect(data.emergencyContact).toBeNull()
  })
})

function patient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: '9019956f-bdd8-4d61-868d-09b02332dad0',
    name: 'Maria Souza',
    phone: '(11) 98812-4471',
    email: '',
    birthDate: null,
    status: 'active',
    createdAt: new Date('2026-08-01T12:00:00.000Z'),
    lastVisitAt: null,
    nextVisitAt: null,
    socialName: null,
    phoneAlt: '',
    biologicalSex: 'not_informed',
    genderIdentity: null,
    emergencyContact: null,
    emergencyContactUnreadable: false,
    ...overrides,
  }
}

describe('campos alterados', () => {
  it('nada mudou, nada é acusado', () => {
    /*
     * Sem normalizar dos dois lados, telefone alternativo apareceria como
     * alterado em TODO save — a entidade carrega a forma de exibição.
     */
    expect(changedFields(patient(), toNewPatientData(validated))).toEqual([])
  })

  it('aponta cada campo novo pelo nome da coluna', () => {
    const changed = changedFields(
      patient(),
      toNewPatientData({
        ...validated,
        socialName: 'Joana',
        biologicalSex: 'female',
        genderIdentity: 'Mulher trans',
        phoneAlt: '21999998888',
      }),
    )

    expect(changed).toEqual([
      'social_name',
      'phone_alt',
      'biological_sex',
      'gender_identity',
    ])
  })

  it('o contato de emergência conta como UM campo', () => {
    const changed = changedFields(
      patient(),
      toNewPatientData({
        ...validated,
        emergencyContactName: 'Maria Mãe',
        emergencyContactPhone: '11988124471',
      }),
    )

    expect(changed).toEqual(['emergency_contact'])
  })

  it('telefone alternativo formatado não conta como mudança', () => {
    const changed = changedFields(
      patient({ phoneAlt: '(21) 99999-8888' }),
      toNewPatientData({ ...validated, phoneAlt: '21999998888' }),
    )

    expect(changed).toEqual([])
  })

  it('mesmo contato em outra ordem de chaves não conta como mudança', () => {
    /*
     * Comparar `JSON.stringify` acusaria mudança a cada save só porque o banco
     * devolveu as chaves em outra ordem.
     */
    const changed = changedFields(
      patient({
        emergencyContact: {
          relationship: 'Mãe',
          phone: '11988124471',
          name: 'Maria Mãe',
        },
      }),
      toNewPatientData({
        ...validated,
        emergencyContactName: 'Maria Mãe',
        emergencyContactPhone: '11988124471',
        emergencyContactRelationship: 'Mãe',
      }),
    )

    expect(changed).toEqual([])
  })

  it('contato ILEGÍVEL conta como mudança', () => {
    /*
     * Salvar por cima substitui o que está lá, e é exatamente isso que a
     * auditoria precisa registrar.
     */
    const changed = changedFields(
      patient({ emergencyContactUnreadable: true }),
      toNewPatientData(validated),
    )

    expect(changed).toEqual(['emergency_contact'])
  })

  it('apagar o contato conta como mudança', () => {
    const changed = changedFields(
      patient({
        emergencyContact: { name: 'Maria', phone: '11988124471', relationship: null },
      }),
      toNewPatientData(validated),
    )

    expect(changed).toEqual(['emergency_contact'])
  })

  it('os valores NUNCA entram — só os nomes das colunas', () => {
    const changed = changedFields(
      patient(),
      toNewPatientData({ ...validated, socialName: 'Joana' }),
    )

    expect(JSON.stringify(changed)).not.toContain('Joana')
  })
})
