import type { CreateClinicInput } from '../schemas/clinic.schema'

/**
 * CONTRATO da tela de onboarding — dono: Claude (codigo).
 * A view nao conhece Supabase, Server Actions nem casos de uso: recebe tudo por
 * props. Ver docs/02-estrutura-de-pastas.md, secao 5.
 */
export interface OnboardingFormViewProps {
  /** Disparado apenas quando a validacao do formulario passa. */
  onSubmit: (values: CreateClinicInput) => void | Promise<void>

  /** Bloqueia novo envio e mantem a largura do botao. */
  isSubmitting: boolean

  /** Erro global do envio. Erros de campo chegam em `fieldErrors`. */
  formError: string | null

  /** Erros vindos do servidor, por campo (ex.: endereco ja em uso). */
  fieldErrors?: Partial<Record<keyof CreateClinicInput, string>>

  /** True depois que a clinica foi criada, enquanto a navegacao acontece. */
  isSuccess: boolean

  /** A clinica existe, mas o JWT precisa ser renovado antes de seguir. */
  claimsStale?: boolean

  /**
   * Encerra a sessao para o usuario entrar de novo com o JWT renovado.
   *
   * Chega por prop, e nao como `action={signOutAction}` direto no `<form>`,
   * porque a view nao importa Server Action — e a regra 3 da §10 de
   * docs/02-estrutura-de-pastas.md, verificada pelo lint desde F-03. Quem sabe
   * QUAL action e o container.
   */
  onSignOut: () => void | Promise<void>

  /** Primeiro nome de quem esta configurando, para a saudacao. */
  greetingName?: string
}
