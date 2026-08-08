import { z } from 'zod'

/**
 * Contrato do cadastro de conta.
 *
 * As mensagens de erro nunca revelam se um e-mail ja existe: enumerar contas de
 * uma clinica e vazamento de dado pessoal (LGPD art. 5, II) alem de vetor de
 * ataque. O caminho de sucesso e sempre o mesmo texto.
 */
export const signUpMessages = {
  nameRequired: 'Digite seu nome completo.',
  nameTooShort: 'O nome precisa ter pelo menos 2 caracteres.',
  nameTooLong: 'O nome pode ter no máximo 120 caracteres.',
  invalidEmail: 'Digite um e-mail válido.',
  passwordTooShort: 'A senha precisa ter pelo menos 8 caracteres.',
  passwordNeedsLetter: 'Inclua pelo menos uma letra.',
  passwordNeedsNumber: 'Inclua pelo menos um número.',
  /** Usada tanto para e-mail ja cadastrado quanto para recusa do provedor. */
  signUpFailed:
    'Não foi possível criar a conta com esses dados. Confira e tente novamente.',
  confirmEmail:
    'Cadastro recebido. Verifique seu e-mail se a confirmação estiver ativa ou entre com sua conta para continuar.',
  unexpected: 'Algo deu errado. Tente novamente em instantes.',
} as const

export const signUpSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, signUpMessages.nameRequired)
    .min(2, signUpMessages.nameTooShort)
    .max(120, signUpMessages.nameTooLong),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, signUpMessages.invalidEmail)
    .email(signUpMessages.invalidEmail),
  password: z
    .string()
    .min(8, signUpMessages.passwordTooShort)
    .regex(/[\p{L}]/u, signUpMessages.passwordNeedsLetter)
    .regex(/[0-9]/, signUpMessages.passwordNeedsNumber),
})

export type SignUpInput = z.infer<typeof signUpSchema>
