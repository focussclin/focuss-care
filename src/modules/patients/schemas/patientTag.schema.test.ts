import { describe, expect, it } from 'vitest'

import { addPatientTagSchema, removePatientTagSchema } from './patientTag.schema'

const patientId = '00000000-0000-4000-8000-000000000001'
const tagId = '00000000-0000-4000-8000-000000000002'

describe('patientTag schemas', () => {
  it('aceita uma tag com nome aparado e cor conhecida', () => {
    expect(
      addPatientTagSchema.parse({
        patientId,
        name: '  Retorno  ',
        color: 'violet',
      }),
    ).toEqual({ patientId, name: 'Retorno', color: 'violet' })
  })

  it('nao permite que o navegador controle clinicId ou o id da tag', () => {
    const parsed = addPatientTagSchema.parse({
      patientId,
      name: 'Prioridade',
      color: 'rose',
      clinicId: '00000000-0000-4000-8000-000000000003',
      tagId,
    })

    expect(parsed).not.toHaveProperty('clinicId')
    expect(parsed).not.toHaveProperty('tagId')
  })

  it('recusa nome vazio, nome longo e cor fora do contrato', () => {
    expect(addPatientTagSchema.safeParse({ patientId, name: ' ', color: 'blue' }).success).toBe(false)
    expect(addPatientTagSchema.safeParse({ patientId, name: 'a'.repeat(41), color: 'blue' }).success).toBe(false)
    expect(addPatientTagSchema.safeParse({ patientId, name: 'Retorno', color: 'purple' }).success).toBe(false)
  })

  it('exige paciente e tag em formato UUID para remover', () => {
    expect(removePatientTagSchema.safeParse({ patientId, tagId }).success).toBe(true)
    expect(removePatientTagSchema.safeParse({ patientId: 'paciente', tagId }).success).toBe(false)
    expect(removePatientTagSchema.safeParse({ patientId, tagId: 'tag' }).success).toBe(false)
  })
})
