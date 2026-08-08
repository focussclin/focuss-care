import type { ReactNode } from 'react'

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

  /**
   * Aviso vindo de FORA do formulario, na mesma regiao de `formError`.
   *
   * Existe por causa do shell estatico (P-C2): o retorno do OAuth chega em
   * `?error=`, que so se conhece em tempo de requisicao. Lido no topo da rota,
   * ele impediria a pagina de prerenderizar; lido dentro de um `<Suspense>` que
   * envolvesse o formulario, a troca do fallback pelo conteudo REMONTARIA os
   * campos e apagaria o que ja tivesse sido digitado.
   *
   * Como slot, o formulario fica inteiro fora da fronteira — estatico e
   * interativo desde o primeiro byte — e so o aviso chega depois.
   */
  notice?: ReactNode

  /** Item 9 do handoff: o botao social so aparece se a autenticacao estiver disponivel. */
  socialAuthEnabled: boolean
  onGoogleSignIn?: () => void | Promise<void>
  isGoogleSubmitting?: boolean

  /** Preserva o e-mail digitado ao navegar para a recuperacao de senha. */
  buildForgotPasswordHref: (email: string) => string

  signUpHref: string
}
