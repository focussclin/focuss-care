import { describe, expect, it } from 'vitest'

import { MAX_ITEMS } from '../domain/Prescription'
import {
  createPrescriptionSchema,
  prescriptionItemSchema,
  prescriptionMessages,
} from './prescription.schema'

const PATIENT = '22222222-2222-4222-8222-222222222222'

const item = {
  drugName: 'Amoxicilina 500 mg',
  dosage: '1 comprimido',
  route: 'Via oral',
  frequency: '8 em 8 horas',
  duration: '7 dias',
  quantity: '1 caixa',
  instructions: '',
}

const base = {
  patientId: PATIENT,
  encounterId: '',
  validUntil: '',
  items: [item],
}

/**
 * Os campos do item são TEXTO LIVRE, e o schema não os interpreta.
 *
 * `dosage`, `route`, `frequency`, `duration` e `quantity` são `text` no banco.
 * Não há enum de via nem unidade de dose para validar, e inventar um obrigaria
 * o profissional a caber numa lista que este código escolheu — além de dar a
 * impressão de que a aplicação confere a prescrição. Ela não confere.
 */
describe('o schema não interpreta a prescrição', () => {
  it('aceita dose escrita como o profissional escreve', () => {
    for (const dosage of ['500 mg', '1 comprimido', '10 gotas', 'meia colher']) {
      expect(
        prescriptionItemSchema.safeParse({ ...item, dosage }).success,
        dosage,
      ).toBe(true)
    }
  })

  it('aceita qualquer via, sem lista fechada', () => {
    for (const route of ['Via oral', 'IV', 'tópica', 'sublingual']) {
      expect(prescriptionItemSchema.safeParse({ ...item, route }).success, route).toBe(true)
    }
  })

  it('não exige nada além do medicamento', () => {
    // Uma receita pode ser só o nome do medicamento; o resto é opcional.
    const parsed = prescriptionItemSchema.parse({ drugName: 'Dipirona' })

    expect(parsed.dosage).toBeNull()
    expect(parsed.route).toBeNull()
    expect(parsed.frequency).toBeNull()
  })
})

describe('medicamento é obrigatório', () => {
  it('item sem nome é recusado', () => {
    expect(prescriptionItemSchema.safeParse({ ...item, drugName: '' }).success).toBe(false)
    expect(prescriptionItemSchema.safeParse({ ...item, drugName: ' ' }).success).toBe(false)
  })

  it('nome longo demais é recusado', () => {
    expect(
      prescriptionItemSchema.safeParse({ ...item, drugName: 'x'.repeat(201) }).success,
    ).toBe(false)
  })

  it('campos textuais têm limite', () => {
    expect(prescriptionItemSchema.safeParse({ ...item, dosage: 'x'.repeat(121) }).success).toBe(false)
    expect(
      prescriptionItemSchema.safeParse({ ...item, instructions: 'x'.repeat(501) }).success,
    ).toBe(false)
  })
})

describe('ao menos um item', () => {
  it('prescrição vazia é recusada', () => {
    const result = createPrescriptionSchema.safeParse({ ...base, items: [] })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toBe(prescriptionMessages.itemsRequired)
    }
  })

  it('há um teto de itens', () => {
    const many = Array.from({ length: MAX_ITEMS + 1 }, () => item)

    expect(createPrescriptionSchema.safeParse({ ...base, items: many }).success).toBe(false)
  })
})

/**
 * O que NÃO entra no schema é a parte que mais importa.
 */
describe('campos que a aplicação nunca aceita do cliente', () => {
  it('`authorId` é descartado — sai de `current_professional_id()`', () => {
    /*
     * Aceitá-lo do formulário deixaria alguém prescrever em nome de outro
     * profissional, o que numa receita é falsidade ideológica.
     */
    const parsed = createPrescriptionSchema.parse({ ...base, authorId: 'outro-profissional' })

    expect(parsed).not.toHaveProperty('authorId')
  })

  it('`issuedAt` é descartado — é o instante da gravação', () => {
    const parsed = createPrescriptionSchema.parse({ ...base, issuedAt: '2020-01-01' })

    expect(parsed).not.toHaveProperty('issuedAt')
  })

  it('assinatura e emissor externo são descartados', () => {
    /*
     * `signed_at`, `signature`, `external_id` e `external_url` pertencem a um
     * emissor que não existe. Preencher `signed_at` sem assinatura real
     * afirmaria que a receita foi assinada.
     */
    const parsed = createPrescriptionSchema.parse({
      ...base,
      signedAt: '2026-08-10T10:00:00.000Z',
      signature: { provider: 'falso' },
      externalId: 'abc',
      externalUrl: 'https://exemplo.invalido/receita',
    })

    expect(Object.keys(parsed).sort()).toEqual([
      'encounterId',
      'items',
      'patientId',
      'validUntil',
    ])
  })
})

describe('validade', () => {
  it('em branco vira null — sem prazo declarado', () => {
    expect(createPrescriptionSchema.parse(base).validUntil).toBeNull()
  })

  it('data ilegível é recusada', () => {
    expect(createPrescriptionSchema.safeParse({ ...base, validUntil: 'amanhã' }).success).toBe(false)
  })

  it('data no passado passa aqui — a comparação é da action', () => {
    /*
     * `new Date()` dentro do schema o tornaria dependente do relógio no momento
     * da importação, e este arquivo passaria a falhar conforme a hora.
     */
    expect(
      createPrescriptionSchema.safeParse({ ...base, validUntil: '2020-01-01' }).success,
    ).toBe(true)
  })
})

describe('atendimento', () => {
  it('em branco vira null — prescrição fora de atendimento é válida', () => {
    expect(createPrescriptionSchema.parse(base).encounterId).toBeNull()
  })

  it('id que não é uuid é recusado', () => {
    expect(
      createPrescriptionSchema.safeParse({ ...base, encounterId: 'consulta-1' }).success,
    ).toBe(false)
  })
})
