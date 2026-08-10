import { z } from 'zod'

/**
 * Contrato da recuperação de senha — **P-RS**.
 *
 * # A regra que manda em todo este arquivo
 *
 * **Nada aqui revela se um e-mail tem conta.** Pedir o link para um endereço
 * cadastrado e para um endereço que nunca existiu produz exatamente a mesma
 * tela, a mesma frase e — na medida do possível — o mesmo tempo de resposta.
 *
 * Não é preciosismo: um formulário que responde "não encontramos esse e-mail" é
 * um oráculo de enumeração. Quem quer saber quais médicos usam o sistema, ou se
 * a sócia de uma clínica tem conta, só precisa de uma lista de endereços e
 * paciência. Para uma base de clínicas, a própria existência da conta já é dado
 * pessoal (LGPD art. 5º, II — dado de saúde por associação).
 *
 * É a mesma decisão já tomada em `signUp.schema.ts`, e as duas precisam
 * continuar iguais: se o cadastro vaza o que a recuperação esconde, o esconder
 * não serviu para nada.
 */

export const passwordRecoveryMessages = {
  // --- Pedido do link -----------------------------------------------------
  invalidEmail: 'Digite um e-mail válido.',
  /**
   * A MESMA frase para conta existente, conta inexistente e recusa do provedor.
   * Note o "Se existir uma conta": a tela não afirma que enviou.
   */
  linkRequested:
    'Se existir uma conta com esse e-mail, o link para criar uma nova senha já está a caminho. Confira também a caixa de spam.',
  requestUnavailable:
    'Não foi possível enviar agora. Tente novamente em instantes.',

  // --- Nova senha ---------------------------------------------------------
  passwordTooShort: 'A senha precisa ter pelo menos 8 caracteres.',
  passwordNeedsLetter: 'Inclua pelo menos uma letra.',
  passwordNeedsNumber: 'Inclua pelo menos um número.',
  passwordTooLong: 'A senha pode ter no máximo 72 caracteres.',
  confirmationMismatch: 'As duas senhas precisam ser iguais.',
  sameAsPrevious: 'Escolha uma senha diferente da anterior.',
  /** O link não abriu sessão: expirou, já foi usado, ou é de outro navegador. */
  linkInvalid:
    'Este link não é mais válido. Peça um novo link de recuperação para continuar.',
  updateUnavailable:
    'Não foi possível salvar a nova senha. Tente novamente em instantes.',
  passwordUpdated:
    'Senha atualizada. Entre com a nova senha para continuar.',
} as const

/**
 * Limite de 72 bytes do bcrypt.
 *
 * Não é escolha de produto: o algoritmo TRUNCA silenciosamente o que passa
 * disso. Aceitar 200 caracteres daria à pessoa a impressão de uma senha longa
 * enquanto só os 72 primeiros valeriam — e ela nunca saberia. Recusar é honesto.
 */
const PASSWORD_MAX_LENGTH = 72

export const requestPasswordResetSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, passwordRecoveryMessages.invalidEmail)
    .email(passwordRecoveryMessages.invalidEmail),
})

export type RequestPasswordResetInput = z.infer<
  typeof requestPasswordResetSchema
>

/**
 * As mesmas exigências de `signUpSchema`, e isso é deliberado.
 *
 * Se a recuperação aceitasse senha mais fraca que o cadastro, ela viraria o
 * caminho preferido para burlar a regra: cria-se a conta com uma senha forte e
 * troca-se por "12345678" um minuto depois.
 */
const password = z
  .string()
  .min(8, passwordRecoveryMessages.passwordTooShort)
  .max(PASSWORD_MAX_LENGTH, passwordRecoveryMessages.passwordTooLong)
  .regex(/[\p{L}]/u, passwordRecoveryMessages.passwordNeedsLetter)
  .regex(/[0-9]/, passwordRecoveryMessages.passwordNeedsNumber)

export const newPasswordSchema = z
  .object({
    password,
    passwordConfirmation: z.string(),
  })
  .refine((values) => values.password === values.passwordConfirmation, {
    // O erro pertence ao campo de CONFIRMAÇÃO: é ele que está diferente do que
    // a pessoa quis, e é nele que ela vai corrigir.
    path: ['passwordConfirmation'],
    message: passwordRecoveryMessages.confirmationMismatch,
  })

export type NewPasswordInput = z.infer<typeof newPasswordSchema>

/**
 * Por que o link pode falhar, em código.
 *
 * O Supabase devolve o motivo na URL do callback (`error_code=otp_expired`, por
 * exemplo). O código atravessa a nossa própria URL até `/recuperar-senha`, e a
 * tela escolhe a frase — o texto do provedor nunca é ecoado, pela mesma razão
 * que `OauthErrorNotice` não ecoa o dele: quem escreve a URL escreveria a
 * mensagem.
 */
export const recoveryLinkErrors = {
  expirado:
    'O link expirou ou já tinha sido usado. Peça um novo abaixo — ele vale por pouco tempo, de propósito.',
  invalido:
    'Não foi possível validar o link. Peça um novo abaixo e abra-o no mesmo navegador em que fez o pedido.',
} as const

export type RecoveryLinkError = keyof typeof recoveryLinkErrors

export function describeRecoveryLinkError(
  code: unknown,
): string | null {
  if (typeof code !== 'string') return null

  return code in recoveryLinkErrors
    ? recoveryLinkErrors[code as RecoveryLinkError]
    : null
}
