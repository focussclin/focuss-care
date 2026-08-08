import { describe, expect, it } from 'vitest'

import { toPatientContactDto } from './toPatientContactDto'
import {
  createPatientContactSchema,
  patientContactMessages,
} from '../schemas/patientContact.schema'

const PATIENT = '9019956f-bdd8-4d61-868d-09b02332dad0'

describe('contrato de contato do paciente', () => {
  it('normaliza telefone, email e vazios antes da escrita', () => {
    const result = createPatientContactSchema.parse({
      patientId: PATIENT,
      name: '  Maria da Silva  ',
      relationship: ' mãe ',
      phone: '+55 (11) 99999-8888',
      email: ' MARIA@EXAMPLE.COM ',
      isLegalGuardian: true,
    })

    expect(result).toMatchObject({
      name: 'Maria da Silva',
      relationship: 'mãe',
      phone: '11999998888',
      email: 'maria@example.com',
    })
  })

  it('rejeita contato sem nome e telefone inválido', () => {
    const result = createPatientContactSchema.safeParse({
      patientId: PATIENT,
      name: ' ',
      relationship: '',
      phone: '123',
      email: '',
      isLegalGuardian: false,
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toEqual(
        expect.arrayContaining([
          patientContactMessages.nameRequired,
          patientContactMessages.phoneInvalid,
        ]),
      )
    }
  })

  it('transporta somente escalares e formata o telefone no DTO', () => {
    const dto = toPatientContactDto({
      id: '11111111-1111-4111-8111-111111111111',
      patientId: PATIENT,
      name: 'Maria da Silva',
      relationship: null,
      phone: '11999998888',
      email: null,
      isLegalGuardian: false,
      createdAt: new Date('2026-08-08T10:00:00.000Z'),
      updatedAt: new Date('2026-08-08T10:00:00.000Z'),
    })

    expect(dto.phone).toBe('(11) 99999-8888')
    expect(dto.createdAt).toBe('2026-08-08T10:00:00.000Z')
    expect(dto).not.toHaveProperty('clinicId')
  })
})
