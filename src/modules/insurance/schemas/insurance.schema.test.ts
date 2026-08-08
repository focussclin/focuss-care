import { describe, expect, it } from 'vitest'

import {
  answerAuthorizationSchema,
  createClaimDenialSchema,
  createAuthorizationSchema,
  createPlanSchema,
  storedProceduresSchema,
  updateClaimDenialSchema,
} from './insurance.schema'

const AUTHORIZATION = '9019956f-bdd8-4d61-868d-09b02332dad0'
const CARD = '5f2b1a3c-4d5e-4f60-8a71-9b2c3d4e5f60'
const PROVIDER = '7e3b0000-0000-4000-8000-00000000b48e'
const INVOICE = '8f3b0000-0000-4000-8000-000000000000'

/**
 * Contratos de convênio (V-01).
 *
 * O ponto central é a união discriminada da resposta: aprovar sem número e negar
 * sem motivo passariam por um schema de campos opcionais, e o defeito só
 * apareceria no faturamento — depois do atendimento prestado.
 */

describe('answerAuthorizationSchema', () => {
  it('aprovação EXIGE número da operadora', () => {
    const result = answerAuthorizationSchema.safeParse({
      authorizationId: AUTHORIZATION,
      outcome: 'approved',
      authorizationNumber: '',
    })

    expect(result.success).toBe(false)
  })

  it('negativa EXIGE o motivo transcrito', () => {
    const result = answerAuthorizationSchema.safeParse({
      authorizationId: AUTHORIZATION,
      outcome: 'denied',
      denialReason: '   ',
    })

    // E o texto que sustenta o recurso; reconstrui-lo de memoria semanas depois
    // nao funciona.
    expect(result.success).toBe(false)
  })

  it('aceita aprovação completa e negativa completa', () => {
    expect(
      answerAuthorizationSchema.safeParse({
        authorizationId: AUTHORIZATION,
        outcome: 'approved',
        authorizationNumber: 'A-123',
        expiresAt: '2026-09-30',
      }).success,
    ).toBe(true)

    expect(
      answerAuthorizationSchema.safeParse({
        authorizationId: AUTHORIZATION,
        outcome: 'denied',
        denialReason: 'procedimento fora de cobertura',
      }).success,
    ).toBe(true)
  })

  it('não deixa uma aprovação carregar motivo de negativa', () => {
    // Uniao discriminada: o ramo `approved` nao tem `denialReason`, entao o
    // campo e ignorado em vez de gravar os dois desfechos ao mesmo tempo.
    const result = answerAuthorizationSchema.safeParse({
      authorizationId: AUTHORIZATION,
      outcome: 'approved',
      authorizationNumber: 'A-123',
      denialReason: 'negado',
    })

    expect(result.success).toBe(true)
    expect(result.data).not.toHaveProperty('denialReason')
  })
})

describe('createAuthorizationSchema', () => {
  it('exige pelo menos um procedimento', () => {
    expect(
      createAuthorizationSchema.safeParse({
        patientInsuranceId: CARD,
        procedures: [],
      }).success,
    ).toBe(false)
  })

  it('não aceita patientId — o paciente vem da carteirinha', () => {
    const result = createAuthorizationSchema.safeParse({
      patientInsuranceId: CARD,
      patientId: '00000000-0000-4000-8000-000000000000',
      procedures: [{ code: '', description: 'Consulta', quantity: 1 }],
    })

    expect(result.success).toBe(true)
    expect(result.data).not.toHaveProperty('patientId')
  })
})

describe('createPlanSchema', () => {
  it('converte coparticipação em centavos', () => {
    const result = createPlanSchema.parse({
      providerId: PROVIDER,
      name: 'Enfermaria',
      copay: '50,00',
      paymentTermDays: '30',
    })

    expect(result.copay).toBe(5000)
    expect(result.paymentTermDays).toBe(30)
  })

  it('recusa prazo fora da faixa', () => {
    expect(
      createPlanSchema.safeParse({
        providerId: PROVIDER,
        name: 'Enfermaria',
        copay: '0',
        paymentTermDays: '0',
      }).success,
    ).toBe(false)
  })
})

describe('storedProceduresSchema', () => {
  it('aceita o que o formulário grava', () => {
    expect(
      storedProceduresSchema.safeParse([
        { code: '10101012', description: 'Consulta', quantity: 1 },
      ]).success,
    ).toBe(true)
  })

  it('recusa formato desconhecido, para o adapter poder cair no vazio', () => {
    expect(storedProceduresSchema.safeParse({ qtd: 'dois' }).success).toBe(false)
    expect(
      storedProceduresSchema.safeParse([{ description: 'Consulta' }]).success,
    ).toBe(false)
  })
})

describe('claim denial schemas', () => {
  it('converte a glosa para centavos e exige motivo', () => {
    const result = createClaimDenialSchema.safeParse({
      invoiceId: INVOICE,
      amount: '125,50',
      deniedAt: '2026-08-08',
      reason: 'Código do procedimento não coberto',
    })

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.amount).toBe(12550)
  })

  it('recusa valor zerado ou data fora do formato', () => {
    expect(
      createClaimDenialSchema.safeParse({
        invoiceId: INVOICE,
        amount: '0,00',
        deniedAt: '08/08/2026',
        reason: 'Motivo',
      }).success,
    ).toBe(false)
  })

  it('exige valor recuperado apenas ao marcar como recuperada', () => {
    expect(
      updateClaimDenialSchema.safeParse({
        denialId: INVOICE,
        status: 'recovered',
        notes: '',
      }).success,
    ).toBe(false)

    expect(
      updateClaimDenialSchema.safeParse({
        denialId: INVOICE,
        status: 'recovered',
        recoveredAmount: '100,00',
        notes: '',
      }).success,
    ).toBe(true)
  })
})
