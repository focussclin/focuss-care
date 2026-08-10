'use client'

import { CheckCircle2, AlertCircle } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/text-field'
import { createSupabaseBrowserClient } from '@/lib/supabase/client'

import {
  passwordRecoveryMessages,
  requestPasswordResetSchema,
} from '../schemas/passwordRecovery.schema'

/** Para onde o link do e-mail leva de volta. Precisa estar na allowlist do callback. */
const RESET_DESTINATION = '/redefinir-senha'

export interface PasswordRecoveryFormProps {
  /** E-mail digitado no login, preservado na navegação (LOGIN_DESIGN §"Copy"). */
  defaultEmail?: string
  /** Aviso de link inválido/expirado, montado pela rota. */
  linkError?: string | null
}

/**
 * Pedido do link de recuperação — primeira metade de **P-RS**.
 *
 * # O que este formulário NÃO faz
 *
 * Não diz se o e-mail existe. Sucesso, e-mail sem conta e recusa do provedor
 * terminam na **mesma tela, com a mesma frase**. Um formulário que respondesse
 * "não encontramos esse e-mail" seria um oráculo: com uma lista de endereços,
 * qualquer um descobriria quem usa o sistema — e, num produto de clínica, saber
 * que alguém tem conta já diz coisas sobre essa pessoa.
 *
 * Por isso o `catch` e o ramo de erro do Supabase caem no mesmo `setSent(true)`.
 * A única falha que a tela admite é a que não fala sobre o e-mail: rede ou
 * ambiente sem Supabase.
 *
 * # Por que no navegador, e não numa Server Action
 *
 * O link precisa voltar para a origem de onde a pessoa está — `localhost:3000`
 * em desenvolvimento, o domínio da clínica em produção. Quem sabe isso sem
 * depender de cabeçalho é o navegador. É o mesmo caminho que
 * `LoginForm.container` já usa para montar o retorno do Google, e reusa o mesmo
 * cliente: nenhum cliente Supabase novo nasce aqui.
 */
export function PasswordRecoveryForm({
  defaultEmail = '',
  linkError = null,
}: PasswordRecoveryFormProps) {
  const [email, setEmail] = useState(defaultEmail)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [isSending, setSending] = useState(false)
  const [isSent, setSent] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setFieldError(null)
    setFormError(null)

    const parsed = requestPasswordResetSchema.safeParse({ email })

    if (!parsed.success) {
      setFieldError(
        parsed.error.issues[0]?.message ??
          passwordRecoveryMessages.invalidEmail,
      )
      return
    }

    setSending(true)

    const supabase = createSupabaseBrowserClient()

    if (!supabase) {
      // Ambiente sem Supabase: dizer "enviado" seria mentira, e esta falha não
      // fala nada sobre o e-mail digitado.
      setFormError(passwordRecoveryMessages.requestUnavailable)
      setSending(false)
      return
    }

    const redirectTo = new URL('/auth/callback', window.location.origin)
    redirectTo.searchParams.set('next', RESET_DESTINATION)

    try {
      /*
       * O resultado é DESCARTADO de propósito.
       *
       * `resetPasswordForEmail` devolve erro em casos que dizem respeito ao
       * e-mail (limite de envios para aquele endereço, por exemplo). Exibi-los
       * separaria "e-mail que existe" de "e-mail que não existe" pelo tempo e
       * pela frase — que é exatamente o que este fluxo não pode fazer.
       */
      await supabase.auth.resetPasswordForEmail(parsed.data.email, {
        redirectTo: redirectTo.toString(),
      })
    } catch {
      // Falha de transporte também não diz nada sobre o e-mail: a resposta
      // continua sendo a mesma.
    }

    setSending(false)
    setSent(true)
  }

  if (isSent) {
    return (
      <div
        role="status"
        className="mt-7 flex items-start gap-2.5 rounded-card border border-status-positive/30 bg-status-positive-surface px-4 py-4 text-aux text-foreground"
      >
        <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>{passwordRecoveryMessages.linkRequested}</span>
      </div>
    )
  }

  return (
    <>
      {linkError ? (
        <p
          role="alert"
          className="mt-6 flex items-start gap-2 rounded-card border border-attention/30 bg-attention-surface px-4 py-3 text-aux text-foreground"
        >
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{linkError}</span>
        </p>
      ) : null}

      {formError ? (
        <p
          role="alert"
          className="mt-6 flex items-start gap-2 rounded-field border border-danger/30 bg-danger-surface px-4 py-3 text-aux text-danger"
        >
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{formError}</span>
        </p>
      ) : null}

      <form noValidate onSubmit={handleSubmit} className="mt-7 flex flex-col gap-4">
        <TextField
          label="E-mail"
          name="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={fieldError ?? undefined}
          placeholder="voce@clinica.com.br"
          disabled={isSending}
        />

        <Button type="submit" size="lg" fullWidth disabled={isSending}>
          {isSending ? 'Enviando…' : 'Enviar link de recuperação'}
        </Button>
      </form>
    </>
  )
}
