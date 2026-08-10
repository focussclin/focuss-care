import { describe, expect, it } from 'vitest'

import {
  recordAllergySchema,
  setAllergyActiveSchema,
  updateAllergySchema,
} from './allergy.schema'

const PATIENT = '22222222-2222-4222-8222-222222222222'
const ALLERGY = '11111111-1111-4111-8111-111111111111'

const valid = { patientId: PATIENT, substance: 'Dipirona', reaction: '' }

/**
 * `severity` não entra em nenhum schema, e a ausência É a decisão.
 *
 * A coluna existe no banco. Um campo aqui viraria um número gravado sob uma
 * escala adivinhada — e a gravidade de uma alergia é justamente o que alguém
 * confere antes de aplicar um medicamento.
 */
describe('gravidade não é aceita', () => {
  it('o campo é descartado no registro', () => {
    const parsed = recordAllergySchema.parse({ ...valid, severity: 3 })

    expect(parsed).not.toHaveProperty('severity')
    expect(Object.keys(parsed).sort()).toEqual(['patientId', 'reaction', 'substance'])
  })

  it('e também na edição', () => {
    const parsed = updateAllergySchema.parse({
      allergyId: ALLERGY,
      substance: 'Dipirona',
      reaction: '',
      severity: 5,
    })

    expect(parsed).not.toHaveProperty('severity')
  })
})

describe('substância', () => {
  it('é obrigatória e vem sem espaço em volta', () => {
    const parsed = recordAllergySchema.parse({ ...valid, substance: '  Penicilina  ' })

    expect(parsed.substance).toBe('Penicilina')
  })

  it('recusa texto curto demais para identificar alguma coisa', () => {
    expect(recordAllergySchema.safeParse({ ...valid, substance: 'a' }).success).toBe(false)
    expect(recordAllergySchema.safeParse({ ...valid, substance: '   ' }).success).toBe(false)
  })

  it('recusa texto longo demais para a coluna', () => {
    expect(
      recordAllergySchema.safeParse({ ...valid, substance: 'x'.repeat(121) }).success,
    ).toBe(false)
  })
})

describe('reação', () => {
  it('vazia vira null, e não string vazia', () => {
    // `''` no banco é indistinguível de "descreveram e apagaram". `null` diz
    // que ninguém descreveu.
    expect(recordAllergySchema.parse(valid).reaction).toBeNull()
  })

  it('aceita texto livre, que é o que se lê antes de prescrever', () => {
    const parsed = recordAllergySchema.parse({ ...valid, reaction: 'Edema de glote' })

    expect(parsed.reaction).toBe('Edema de glote')
  })

  it('recusa texto longo demais', () => {
    expect(recordAllergySchema.safeParse({ ...valid, reaction: 'x'.repeat(501) }).success).toBe(false)
  })
})

describe('identificadores', () => {
  it('o paciente é exigido por uuid', () => {
    expect(recordAllergySchema.safeParse({ ...valid, patientId: 'maria' }).success).toBe(false)
  })

  it('a edição não carrega paciente', () => {
    /*
     * Quem descobre o paciente é o servidor, lendo a própria alergia. Aceitar
     * `patientId` do cliente deixaria alguém apontar a checagem de duplicidade
     * para outra ficha.
     */
    const parsed = updateAllergySchema.parse({
      allergyId: ALLERGY,
      substance: 'Dipirona',
      reaction: '',
      patientId: PATIENT,
    })

    expect(parsed).not.toHaveProperty('patientId')
  })

  it('descartar exige booleano explícito', () => {
    expect(setAllergyActiveSchema.safeParse({ allergyId: ALLERGY, isActive: false }).success).toBe(true)
    expect(setAllergyActiveSchema.safeParse({ allergyId: ALLERGY }).success).toBe(false)
  })
})
