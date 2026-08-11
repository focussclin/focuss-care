import { describe, expect, it } from 'vitest'

import {
  createPatientMessages,
  createPatientSchema,
  updatePatientSchema,
} from './patient.schema'

/**
 * Identificação e contato no contrato do SERVIDOR — P-01 completa.
 *
 * O formulário valida para dar retorno rápido; este schema é o que decide o que
 * chega ao banco. As duas escritas — cadastro e edição — passam pelas mesmas
 * regras, e é isso que impede o cadastro de gravar meio contato de emergência.
 */

const base = {
  name: 'Maria Souza',
  phone: '(11) 98812-4471',
}

function parse(overrides: Record<string, unknown> = {}) {
  return createPatientSchema.safeParse({ ...base, ...overrides })
}

function issue(result: ReturnType<typeof parse>, path: string) {
  if (result.success) return null
  return result.error.issues.find((entry) => entry.path[0] === path)?.message ?? null
}

describe('o cadastro mínimo continua sendo nome e telefone', () => {
  it('sem nenhum campo novo, passa', () => {
    /*
     * Exigir sexo biológico para marcar uma consulta inventaria dado clínico na
     * pressa do balcão.
     */
    const result = parse()

    expect(result.success).toBe(true)
  })

  it('sem informar, o sexo biológico é `not_informed`', () => {
    // A coluna é NOT NULL; o enum tem o valor exato para "ninguém perguntou".
    const result = parse()

    expect(result.success && result.data.biologicalSex).toBe('not_informed')
  })
})

describe('nome social', () => {
  it('vazio vira null, e não string vazia', () => {
    const result = parse({ socialName: '   ' })

    expect(result.success && result.data.socialName).toBeNull()
  })

  it('perde o espaço das pontas', () => {
    const result = parse({ socialName: '  Joana  ' })

    expect(result.success && result.data.socialName).toBe('Joana')
  })

  it('acima de 160 caracteres é recusado', () => {
    expect(parse({ socialName: 'a'.repeat(161) }).success).toBe(false)
  })
})

describe('sexo biológico', () => {
  it.each(['female', 'male', 'intersex', 'not_informed'])('aceita %s', (value) => {
    const result = parse({ biologicalSex: value })

    expect(result.success && result.data.biologicalSex).toBe(value)
  })

  it('valor fora do enum é recusado', () => {
    // Mandá-lo faria o insert falhar no banco, longe do campo que o causou.
    expect(parse({ biologicalSex: 'outro' }).success).toBe(false)
  })
})

describe('telefone alternativo', () => {
  it('sai em dígitos, como o principal', () => {
    const result = parse({ phoneAlt: '(21) 99999-8888' })

    expect(result.success && result.data.phoneAlt).toBe('21999998888')
  })

  it('vazio vira null', () => {
    const result = parse({ phoneAlt: '' })

    expect(result.success && result.data.phoneAlt).toBeNull()
  })

  it('número inválido é recusado', () => {
    expect(issue(parse({ phoneAlt: '123' }), 'phoneAlt')).toBe(
      createPatientMessages.phoneInvalid,
    )
  })
})

/**
 * Nome sem telefone não permite avisar ninguém, e é numa emergência que alguém
 * vai procurar este campo.
 */
describe('contato de emergência', () => {
  it('nome e telefone juntos passam', () => {
    const result = parse({
      emergencyContactName: 'Maria Mãe',
      emergencyContactPhone: '(11) 98812-4471',
      emergencyContactRelationship: 'Mãe',
    })

    expect(result.success).toBe(true)
  })

  it('nenhum dos dois também passa — o contato é opcional', () => {
    expect(parse().success).toBe(true)
  })

  it('nome sem telefone é recusado, no campo do telefone', () => {
    expect(
      issue(parse({ emergencyContactName: 'Maria' }), 'emergencyContactPhone'),
    ).toBe(createPatientMessages.emergencyPhoneRequired)
  })

  it('telefone sem nome é recusado, no campo do nome', () => {
    expect(
      issue(
        parse({ emergencyContactPhone: '(11) 98812-4471' }),
        'emergencyContactName',
      ),
    ).toBe(createPatientMessages.emergencyNameRequired)
  })

  it('só o parentesco não sustenta contato nenhum', () => {
    expect(parse({ emergencyContactRelationship: 'Mãe' }).success).toBe(false)
  })

  it('o telefone do contato também sai em dígitos', () => {
    const result = parse({
      emergencyContactName: 'Maria',
      emergencyContactPhone: '(11) 98812-4471',
    })

    expect(result.success && result.data.emergencyContactPhone).toBe('11988124471')
  })
})

/**
 * A regra vale nas DUAS escritas. Aplicá-la só na edição deixaria o cadastro
 * gravar meio contato — e o defeito só apareceria numa emergência.
 */
describe('a edição carrega as mesmas regras', () => {
  const patientId = '9019956f-bdd8-4d61-868d-09b02332dad0'

  it('meio contato é recusado também na edição', () => {
    const result = updatePatientSchema.safeParse({
      ...base,
      patientId,
      emergencyContactName: 'Maria',
    })

    expect(result.success).toBe(false)
  })

  it('apagar o contato inteiro é permitido', () => {
    /*
     * Limpar os campos é edição legítima: um contato errado numa emergência é
     * pior que nenhum.
     */
    const result = updatePatientSchema.safeParse({
      ...base,
      patientId,
      emergencyContactName: '',
      emergencyContactPhone: '',
      emergencyContactRelationship: '',
    })

    expect(result.success).toBe(true)
    expect(result.success && result.data.emergencyContactName).toBeNull()
  })

  it('a edição aceita telefone vazio, como antes', () => {
    const result = updatePatientSchema.safeParse({ ...base, patientId, phone: '' })

    expect(result.success && result.data.phone).toBeNull()
  })
})
