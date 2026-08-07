'use client'

import { useState, useTransition } from 'react'

import { createSupabaseBrowserClient } from '@/lib/supabase/client'

import { signInAction } from '../actions/signIn.action'
import { loginMessages, type LoginInput } from '../schemas/login.schema'
import { LoginFormView } from './LoginForm.view'

/**
 * Liga a view ao caso de uso — dono: Claude (codigo).
 * Nao contem decisao visual: apenas dados, estado de envio e navegacao.
 */
interface LoginFormContainerProps {
  oauthError?: string
  nextPath?: string
}

const oauthMessages: Record<string, string> = {
  oauth_cancelled: 'O login com Google foi cancelado. Você pode tentar novamente.',
  oauth_error: 'Não foi possível concluir o login com Google. Tente novamente.',
  invalid_callback: 'O retorno da autenticação é inválido. Inicie o login novamente.',
  connection_error: 'Não foi possível conectar ao serviço de autenticação.',
}

export function LoginFormContainer({
  oauthError,
  nextPath = '/dashboard',
}: LoginFormContainerProps) {
  const [formError, setFormError] = useState<string | null>(
    oauthError ? oauthMessages[oauthError] ?? oauthMessages.oauth_error : null,
  )
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

    const callbackUrl = new URL('/auth/callback', window.location.origin)
    callbackUrl.searchParams.set('next', nextPath === '/dashboard' ? nextPath : '/dashboard')

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
