'use client'

import { useState, useTransition, type ReactNode } from 'react'

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

  async function handleSubmit(values: LoginInput) {
    setFormError(null)

    startTransition(async () => {
      try {
        const result = await signInAction(values)

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
     * O retorno do OAuth vai SEMPRE para `/dashboard`.
     *
     * Antes existia um prop `nextPath`, vindo de `?next=` da URL, e ele era
     * fixado em `/dashboard` na linha seguinte — ou seja, nao tinha efeito
     * nenhum. O prop saiu; a decisao continua, agora dita em voz alta: destino
     * escolhido pela URL num retorno de autenticacao e redirecionamento aberto,
     * e o convite (`/login?next=/convite/<token>`) e o unico caso que perde
     * algo com isso. Preserva-lo exige uma lista de destinos permitidos, que e
     * trabalho proprio — nao um `set()` que aceita o que vier.
     */
    const callbackUrl = new URL('/auth/callback', window.location.origin)
    callbackUrl.searchParams.set('next', '/dashboard')

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
