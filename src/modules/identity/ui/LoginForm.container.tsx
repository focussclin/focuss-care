'use client'

import { useState, useTransition } from 'react'

import { signInAction } from '../actions/signIn.action'
import { loginMessages, type LoginInput } from '../schemas/login.schema'
import { LoginFormView } from './LoginForm.view'

/**
 * Liga a view ao caso de uso — dono: Claude (codigo).
 * Nao contem decisao visual: apenas dados, estado de envio e navegacao.
 */
export function LoginFormContainer() {
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

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

  return (
    <LoginFormView
      onSubmit={handleSubmit}
      isSubmitting={isPending}
      formError={formError}
      // Habilitar quando o provedor OAuth estiver configurado no Supabase.
      // O handoff pede o botao social apenas se a autenticacao estiver disponivel.
      socialAuthEnabled={false}
      buildForgotPasswordHref={(email) =>
        email
          ? `/recuperar-senha?email=${encodeURIComponent(email)}`
          : '/recuperar-senha'
      }
      signUpHref="/cadastro"
    />
  )
}
