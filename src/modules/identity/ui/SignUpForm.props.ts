import type { SignUpInput } from '../schemas/signUp.schema'

/**
 * CONTRATO da tela de cadastro — dono: Claude (codigo).
 * A view nao conhece Supabase nem Server Actions: recebe tudo por props.
 */
export interface SignUpFormViewProps {
  /** Disparado apenas quando a validacao do formulario passa. */
  onSubmit: (values: SignUpInput) => void | Promise<void>

  isSubmitting: boolean

  /** Erro global do envio. Nunca revela se o e-mail ja existe. */
  formError: string | null

  fieldErrors?: Partial<Record<keyof SignUpInput, string>>

  /**
   * Mensagem de sucesso quando o projeto exige confirmacao por e-mail.
   * Null quando a sessao ja foi aberta e a navegacao esta a caminho.
   */
  confirmationMessage: string | null

  /** True depois que a conta foi criada, enquanto a navegacao acontece. */
  isSuccess: boolean

  signInHref: string
}
