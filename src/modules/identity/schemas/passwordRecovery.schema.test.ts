import { describe, expect, it } from 'vitest'

import { signUpSchema } from './signUp.schema'
import {
  describeRecoveryLinkError,
  newPasswordSchema,
  passwordRecoveryMessages,
  requestPasswordResetSchema,
} from './passwordRecovery.schema'

/**
 * O contrato da recuperação de senha (P-RS).
 *
 * Dois testes aqui não são sobre validação, e são os que mais importam:
 *
 *  - a força exigida na nova senha **não pode ser menor** que a do cadastro,
 *    senão a recuperação vira o caminho para burlar a regra;
 *  - nenhuma mensagem deste arquivo pode falar sobre a existência da conta.
 */

describe('pedido do link', () => {
  it.each([
    ['maiúsculas', '  Maria@Clinica.com.BR  ', 'maria@clinica.com.br'],
    ['espaços', ' ana@exemplo.com ', 'ana@exemplo.com'],
  ])('normaliza o e-mail com %s', (_label, raw, expected) => {
    const result = requestPasswordResetSchema.safeParse({ email: raw })

    expect(result.success).toBe(true)
    if (result.success) expect(result.data.email).toBe(expected)
  })

  it.each([['vazio', ''], ['sem arroba', 'maria'], ['sem domínio', 'maria@']])(
    'recusa e-mail %s',
    (_label, email) => {
      const result = requestPasswordResetSchema.safeParse({ email })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues[0]?.message).toBe(
          passwordRecoveryMessages.invalidEmail,
        )
      }
    },
  )

  it('descarta campo que o cliente inventar', () => {
    const result = requestPasswordResetSchema.safeParse({
      email: 'maria@exemplo.com',
      redirectTo: 'https://exemplo.net',
    })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toEqual({ email: 'maria@exemplo.com' })
    }
  })
})

describe('nova senha', () => {
  function parse(password: string, passwordConfirmation = password) {
    return newPasswordSchema.safeParse({ password, passwordConfirmation })
  }

  it('aceita senha com letra, número e 8 caracteres', () => {
    expect(parse('clinica1').success).toBe(true)
  })

  it.each([
    ['curta', 'abc123', passwordRecoveryMessages.passwordTooShort],
    ['sem número', 'clinicasegura', passwordRecoveryMessages.passwordNeedsNumber],
    ['sem letra', '123456789', passwordRecoveryMessages.passwordNeedsLetter],
  ])('recusa senha %s', (_label, password, message) => {
    const result = parse(password)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        message,
      )
    }
  })

  it('recusa senha acima do limite do bcrypt em vez de truncar em silêncio', () => {
    const result = parse(`${'a'.repeat(80)}1`)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.message)).toContain(
        passwordRecoveryMessages.passwordTooLong,
      )
    }
  })

  it('exige as duas iguais, e o erro fica no campo de confirmação', () => {
    const result = parse('clinica1', 'clinica2')

    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find(
        (candidate) => candidate.path[0] === 'passwordConfirmation',
      )
      expect(issue?.message).toBe(
        passwordRecoveryMessages.confirmationMismatch,
      )
    }
  })
})

describe('a recuperação não pode ser a porta dos fundos do cadastro', () => {
  /*
   * Se a nova senha pudesse ser mais fraca que a do cadastro, bastaria criar a
   * conta com uma senha forte e trocá-la por outra um minuto depois.
   */
  it.each([
    ['curta demais', 'abc123'],
    ['só letras', 'clinicasegura'],
    ['só números', '123456789'],
  ])('recusa em ambos os fluxos: %s', (_label, password) => {
    const atCadastro = signUpSchema.safeParse({
      fullName: 'Maria Silva',
      email: 'maria@exemplo.com',
      password,
    })
    const atRecuperacao = newPasswordSchema.safeParse({
      password,
      passwordConfirmation: password,
    })

    expect(atCadastro.success).toBe(false)
    expect(atRecuperacao.success).toBe(false)
  })

  it('aceita em ambos os fluxos a mesma senha válida', () => {
    const password = 'clinica2026'

    expect(
      signUpSchema.safeParse({
        fullName: 'Maria Silva',
        email: 'maria@exemplo.com',
        password,
      }).success,
    ).toBe(true)
    expect(
      newPasswordSchema.safeParse({ password, passwordConfirmation: password })
        .success,
    ).toBe(true)
  })
})

describe('nenhuma mensagem revela se a conta existe', () => {
  it.each(Object.entries(passwordRecoveryMessages))(
    '%s não afirma nem nega a existência do e-mail',
    (_key, message) => {
      const text = message.toLowerCase()

      expect(text).not.toContain('não encontramos')
      expect(text).not.toContain('não existe')
      expect(text).not.toContain('e-mail cadastrado')
      expect(text).not.toContain('conta não')
    },
  )

  it('a confirmação do envio é condicional, e não uma afirmação', () => {
    expect(passwordRecoveryMessages.linkRequested).toMatch(/^se existir/i)
  })
})

describe('motivo da falha do link', () => {
  it.each([
    ['expirado', /expirou/i],
    ['invalido', /mesmo navegador/i],
  ])('traduz o código %s', (code, expected) => {
    expect(describeRecoveryLinkError(code)).toMatch(expected)
  })

  it.each([
    ['desconhecido', 'qualquer-coisa'],
    ['ausente', undefined],
    ['não-string', 42],
  ])('devolve null para código %s', (_label, code) => {
    expect(describeRecoveryLinkError(code)).toBeNull()
  })

  it('não ecoa o conteúdo do parâmetro', () => {
    const forjada = 'Confirme sua senha em focuss-care.exemplo.net'

    expect(describeRecoveryLinkError(forjada)).toBeNull()
  })
})
