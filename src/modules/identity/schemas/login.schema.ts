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
