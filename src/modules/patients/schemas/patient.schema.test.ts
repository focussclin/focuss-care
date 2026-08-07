import { describe, expect, it } from 'vitest'

import {
  archivePatientSchema,
  createPatientSchema,
  editPatientFormSchema,
  updatePatientSchema,
} from './patient.schema'

/**
 * O contrato de escrita do servidor.
 *
 * Os dois primeiros blocos sao teste de SEGURANCA, nao de formatacao: se o schema
 * parar de descartar chave desconhecida, um `clinicId` vindo do navegador passa a
 * chegar ao repositorio. A RLS ainda recusaria, mas a defesa que este projeto
 * escolheu (P3 de docs/01-arquitetura.md) e nao aceitar o campo — e regra sem
 * teste e regra que volta na proxima refatoracao.
 */

const validInput = {
  name: 'Maria Souza',
  phone: '(11) 98812-4471',
  email: '',
  birthDate: '',
  contactPreference: 'WhatsApp',
  notes: '',
}

describe('createPatientSchema — o que o cliente NAO consegue mandar', () => {
  it('descarta clinicId e createdBy enviados pelo cliente', () => {
    const parsed = createPatientSchema.parse({
      ...validInput,
      clinicId: '00000000-0000-0000-0000-000000000000',
      createdBy: 'outro-usuario',
      isActive: false,
    })

    expect(parsed).not.toHaveProperty('clinicId')
    expect(parsed).not.toHaveProperty('createdBy')
    expect(parsed).not.toHaveProperty('isActive')
  })

  it('descarta contactPreference, que nao tem coluna no schema remoto', () => {
    const parsed = createPatientSchema.parse(validInput)

    expect(parsed).not.toHaveProperty('contactPreference')
  })
})

describe('createPatientSchema — normalizacao', () => {
  it('guarda o telefone so em digitos, sem o codigo do pais', () => {
    expect(createPatientSchema.parse(validInput).phone).toBe('11988124471')

    expect(
      createPatientSchema.parse({ ...validInput, phone: '+55 11 98812-4471' })
        .phone,
    ).toBe('11988124471')
  })

  it('recusa telefone sem DDD', () => {
    const result = createPatientSchema.safeParse({
      ...validInput,
      phone: '98812-4471',
    })

    expect(result.success).toBe(false)
  })

  it('normaliza o e-mail e transforma vazio em null', () => {
    expect(
      createPatientSchema.parse({ ...validInput, email: '  Maria@Email.COM ' })
        .email,
    ).toBe('maria@email.com')

    expect(createPatientSchema.parse(validInput).email).toBeNull()
    expect(createPatientSchema.parse({ ...validInput, email: '   ' }).email).toBeNull()
  })

  it('transforma observacao vazia em null, e apara a preenchida', () => {
    expect(createPatientSchema.parse(validInput).notes).toBeNull()
    expect(
      createPatientSchema.parse({ ...validInput, notes: '  vem acompanhada  ' })
        .notes,
    ).toBe('vem acompanhada')
  })
})

describe('createPatientSchema — data de nascimento', () => {
  it('aceita data valida e vazio', () => {
    expect(
      createPatientSchema.parse({ ...validInput, birthDate: '1991-03-14' })
        .birthDate,
    ).toBe('1991-03-14')

    expect(createPatientSchema.parse(validInput).birthDate).toBeNull()
  })

  it('recusa data que nao existe no calendario', () => {
    // O construtor de Date "conserta" 31/02 para 03/03 em silencio.
    expect(
      createPatientSchema.safeParse({ ...validInput, birthDate: '2026-02-31' })
        .success,
    ).toBe(false)
  })

  it('recusa data no futuro e ano anterior a 1900', () => {
    expect(
      createPatientSchema.safeParse({ ...validInput, birthDate: '2099-01-01' })
        .success,
    ).toBe(false)

    expect(
      createPatientSchema.safeParse({ ...validInput, birthDate: '1899-12-31' })
        .success,
    ).toBe(false)
  })

  it('recusa formato que nao seja YYYY-MM-DD', () => {
    expect(
      createPatientSchema.safeParse({ ...validInput, birthDate: '14/03/1991' })
        .success,
    ).toBe(false)
  })
})

describe('updatePatientSchema e archivePatientSchema', () => {
  it('exige um patientId em formato de uuid', () => {
    expect(
      updatePatientSchema.safeParse({ ...validInput, patientId: 'abc' }).success,
    ).toBe(false)

    expect(
      updatePatientSchema.safeParse({
        ...validInput,
        patientId: '9019956f-bdd8-4d61-868d-09b02332dad0',
      }).success,
    ).toBe(true)
  })

  it('continua descartando clinicId na edicao', () => {
    const parsed = updatePatientSchema.parse({
      ...validInput,
      patientId: '9019956f-bdd8-4d61-868d-09b02332dad0',
      clinicId: '00000000-0000-0000-0000-000000000000',
    })

    expect(parsed).not.toHaveProperty('clinicId')
  })

  it('arquivar exige booleano explicito', () => {
    expect(
      archivePatientSchema.safeParse({
        patientId: '9019956f-bdd8-4d61-868d-09b02332dad0',
        archived: 'sim',
      }).success,
    ).toBe(false)
  })

  it('permite apagar o telefone na edicao, mas nao aceita numero invalido', () => {
    expect(
      updatePatientSchema.parse({
        ...validInput,
        phone: '',
        patientId: '9019956f-bdd8-4d61-868d-09b02332dad0',
      }).phone,
    ).toBeNull()

    expect(
      updatePatientSchema.safeParse({
        ...validInput,
        phone: '123',
        patientId: '9019956f-bdd8-4d61-868d-09b02332dad0',
      }).success,
    ).toBe(false)
  })
})

/**
 * O formulario de edicao e o servidor precisam concordar sobre o telefone.
 *
 * Enquanto discordaram, o servidor aceitava apagar o campo e a TELA barrava antes
 * de chegar la — e cadastro antigo sem telefone (a coluna e nullable) nao podia ser
 * salvo de jeito nenhum. Este bloco existe para que a divergencia nao volte.
 */
describe('editPatientFormSchema — o contrato da tela de edicao', () => {
  const formInput = {
    name: 'Maria Souza',
    phone: '(11) 98812-4471',
    email: '',
    birthDate: '',
    notes: '',
  }

  it('aceita telefone vazio, como o updatePatientSchema', () => {
    expect(editPatientFormSchema.safeParse({ ...formInput, phone: '' }).success).toBe(
      true,
    )
  })

  it('continua recusando telefone preenchido e invalido', () => {
    expect(
      editPatientFormSchema.safeParse({ ...formInput, phone: '98812-4471' }).success,
    ).toBe(false)
  })

  it('nao normaliza: o campo tem de exibir o que o usuario digitou', () => {
    expect(editPatientFormSchema.parse(formInput).phone).toBe('(11) 98812-4471')
  })

  it('nao tem preferencia de contato — nao existe coluna para ela', () => {
    const parsed = editPatientFormSchema.parse({
      ...formInput,
      contactPreference: 'WhatsApp',
    })

    expect(parsed).not.toHaveProperty('contactPreference')
  })
})
