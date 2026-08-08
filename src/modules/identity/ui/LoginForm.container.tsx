'use client'

import { useState, useTransition, type ReactNode } from 'react'

import { safeNextPath } from '@/lib/routes/safeNextPath'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

import { signInAction } from '../actions/signIn.action'
import { loginMessages, type LoginInput } from '../schemas/login.schema'
import { LoginFormView } from './LoginForm.view'

/**
 * Liga a view ao caso de uso — dono: Claude (codigo).
 * Nao contem decisao visual: apenas dados, estado de envio e navegacao.
 */
interface LoginFormContainerProps {
  /**
   * Aviso montado pela ROTA, exibido acima do erro do envio.
   *
   * Hoje e o retorno do OAuth (`?error=`), dentro de um `<Suspense>`. Ele chega
   * como elemento pronto, e nao como texto, porque o formulario precisa ficar
   * FORA da fronteira dinamica para prerenderizar — ver `OauthErrorNotice`.
   */
  notice?: ReactNode
}

export function LoginFormContainer({ notice }: LoginFormContainerProps) {
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [isGooglePending, setIsGooglePending] = useState(false)

  /**
   * Para onde a pessoa ia antes de ser mandada para cá.
   *
   * Lido de `window.location` no momento do envio, e não de `searchParams` na
   * rota, por causa do shell estático (P-C2): ler a URL no servidor tiraria o
   * formulário do prerender, que foi o trabalho da fatia anterior. No envio já
   * estamos no navegador, e ler a barra de endereços ali não custa nada.
   *
   * O valor **não é confiável** — é URL. Quem decide é `safeNextPath`, dentro da
   * Server Action.
   */
  function requestedNext(): string | undefined {
    return (
      new URLSearchParams(window.location.search).get('next') ?? undefined
    )
  }

  async function handleSubmit(values: LoginInput) {
    setFormError(null)

    startTransition(async () => {
      try {
        const result = await signInAction(values, requestedNext())

        if (!result.ok) {
          setFormError(result.error ?? loginMessages.invalidCredentials)
        }
        // Sucesso: o redirecionamento vem da propria action assim que o
        // Supabase Auth estiver integrado (ela emite o cookie de sessao).
      } catch {
        setFormError(loginMessages.unexpected)
      }
    })
  }

  async function handleGoogleSignIn() {
    setFormError(null)
    setIsGooglePending(true)

    const supabase = createSupabaseBrowserClient()
    if (!supabase) {
      setFormError('A autenticação ainda não está disponível neste ambiente.')
      setIsGooglePending(false)
      return
    }

    /*
     * O destino atravessa o Google e volta pelo callback, que o valida com o
     * MESMO `safeNextPath` da action de senha. Mandar daqui sem validar seria
     * inofensivo (o callback recusaria), mas mandar o que veio da URL sem dizer
     * isso convida a alguém confiar no valor mais adiante.
     */
    const callbackUrl = new URL('/auth/callback', window.location.origin)
    callbackUrl.searchParams.set('next', safeNextPath(requestedNext()))

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callbackUrl.toString() },
    })

    if (error || !data.url) {
      setFormError('Não foi possível iniciar o login com Google. Tente novamente.')
      setIsGooglePending(false)
      return
    }

    window.location.assign(data.url)
  }

  return (
    <LoginFormView
      onSubmit={handleSubmit}
      isSubmitting={isPending}
      formError={formError}
      notice={notice}
      // Habilitar quando o provedor OAuth estiver configurado no Supabase.
      // O handoff pede o botao social apenas se a autenticacao estiver disponivel.
      socialAuthEnabled
      onGoogleSignIn={handleGoogleSignIn}
      isGoogleSubmitting={isGooglePending}
      buildForgotPasswordHref={(email) =>
        email
          ? `/recuperar-senha?email=${encodeURIComponent(email)}`
          : '/recuperar-senha'
      }
      signUpHref="/cadastro"
    />
  )
}
