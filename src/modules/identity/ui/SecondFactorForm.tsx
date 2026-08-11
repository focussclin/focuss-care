'use client'

import { ShieldCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/text-field'
import { isValidTotpCode, normalizeTotpCode } from '@/lib/security/mfa'

import { verifyTotpAction } from '../actions/mfa.action'
import { mfaMessages } from '../schemas/mfa.schema'

export interface SecondFactorFormProps {
  /** Fatores verificados da conta. Vazio significa que não há o que apresentar. */
  factors: readonly { id: string; friendlyName: string | null }[]
  /** Para onde ir depois. Já validado no servidor por `safeNextPath`. */
  next: string
}

/**
 * A segunda etapa do login — feature **S-MFA**.
 *
 * # Por que esta tela existe separada
 *
 * A senha certa deixa a sessão em `aal1`. Enquanto o código não é apresentado, a
 * sessão não alcança nada protegido — e a casca do aplicativo devolve para cá
 * quem tentar digitar uma URL interna. Esta tela é o único caminho para cima.
 *
 * # Sem "lembrar deste aparelho"
 *
 * Seria a primeira coisa a pedir, e é justamente o que esvazia o segundo fator:
 * um dispositivo lembrado é uma sessão que volta a valer só com a senha. Se um
 * dia entrar, entra como decisão explícita, com prazo e com registro — não como
 * caixinha marcada por padrão.
 */
export function SecondFactorForm({ factors, next }: SecondFactorFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)

  /*
   * O primeiro fator verificado. A conta pode ter mais de um aparelho, e todos
   * geram códigos válidos para o mesmo segredo — não há o que escolher.
   */
  const factor = factors[0]

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!factor) return

    setError(null)

    startTransition(async () => {
      try {
        const result = await verifyTotpAction(factor.id, code)

        if (!result.ok) {
          setError(result.error ?? mfaMessages.codeRejected)
          setCode('')
          return
        }

        router.replace(next)
      } catch {
        setError(mfaMessages.unavailable)
      }
    })
  }

  if (!factor) {
    /*
     * Estado impossível pelo caminho normal — a rota só existe quando há fator.
     * Renderizar o formulário assim mesmo deixaria um campo que nunca envia.
     */
    return (
      <p role="alert" className="mt-6 text-control text-danger">
        {mfaMessages.listUnavailable}
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
      <TextField
        label="Código de verificação"
        value={code}
        // `inputMode` numérico abre o teclado certo no celular, que é onde o
        // código está sendo lido.
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        maxLength={7}
        disabled={isPending}
        hint={
          factor.friendlyName
            ? `Abra o ${factor.friendlyName} e digite o código atual.`
            : 'Abra seu aplicativo autenticador e digite o código atual.'
        }
        onChange={(event) => setCode(normalizeTotpCode(event.target.value))}
      />

      {error ? (
        <p
          role="alert"
          className="rounded-field border border-danger/30 bg-danger-surface px-4 py-3 text-aux text-danger"
        >
          {error}
        </p>
      ) : null}

      <Button type="submit" disabled={isPending || !isValidTotpCode(code)}>
        <ShieldCheck aria-hidden className="size-4" />
        {isPending ? 'Verificando…' : 'Verificar e entrar'}
      </Button>
    </form>
  )
}
