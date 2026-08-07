import type { LoginInput } from '../schemas/login.schema'

/**
 * CONTRATO da tela de login — dono: Claude (codigo).
 * A view (dono: Codex) implementa contra esta interface e nao conhece Supabase,
 * Server Actions nem casos de uso. Ver docs/02-estrutura-de-pastas.md, secao 5.
 */
export interface LoginFormViewProps {
  /** Disparado apenas quando a validacao do formulario passa. */
  onSubmit: (values: LoginInput) => void | Promise<void>

  /** Mantem a largura do botao e bloqueia novo envio. */
  isSubmitting: boolean

  /**
   * Erro global do envio (ex.: credenciais invalidas).
   * Erros de campo sao responsabilidade da propria view.
   */
  formError: string | null

  /** Item 9 do handoff: o botao social so aparece se a autenticacao estiver disponivel. */
  socialAuthEnabled: boolean
  onGoogleSignIn?: () => void

  /** Preserva o e-mail digitado ao navegar para a recuperacao de senha. */
  buildForgotPasswordHref: (email: string) => string

  signUpHref: string
}
