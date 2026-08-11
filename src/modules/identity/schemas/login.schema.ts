import { z } from 'zod'

/**
 * Mensagens exatas do handoff (LOGIN_DESIGN.md, secao "Copy e comportamento").
 * Centralizadas aqui para que view, container e Server Action falem a mesma lingua.
 */
export const loginMessages = {
  invalidEmail: 'Digite um e-mail válido.',
  emptyPassword: 'Digite sua senha.',
  invalidCredentials:
    'Não foi possível entrar. Confira seus dados e tente novamente.',
  unexpected: 'Algo deu errado. Tente novamente em instantes.',
  /**
   * Tentativas demais.
   *
   * Diz quanto esperar, e **não** diz se o e-mail existe — a frase é a mesma
   * para conta real e inventada. Revelar aqui transformaria o controle de taxa
   * num enumerador de contas.
   */
  tooManyAttempts: (seconds: number) =>
    `Muitas tentativas seguidas. Aguarde ${seconds} segundo${seconds === 1 ? '' : 's'} e tente de novo.`,
} as const

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, loginMessages.invalidEmail)
    .email(loginMessages.invalidEmail),
  password: z.string().min(1, loginMessages.emptyPassword),
  rememberMe: z.boolean(),
})

export type LoginInput = z.infer<typeof loginSchema>
