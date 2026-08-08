'use client'

import { CheckCircle2, MailCheck, XCircle } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'

import { acceptInvitationAction } from '../actions/acceptInvitation.action'
import { invitationMessages } from '../schemas/invitation.schema'

export interface AcceptInvitationProps {
  token: string
}

type Outcome =
  | { kind: 'idle' }
  | { kind: 'accepted'; warning?: string }
  | { kind: 'failed'; message: string }

/**
 * Aceite de convite (I-04).
 *
 * # Por que há um botão, e não aceite automático ao abrir o link
 *
 * Aceitar cria um vínculo de acesso a dados de saúde. Fazer isso no
 * carregamento da página transformaria um `GET` em efeito colateral: bastaria
 * alguém abrir o link — um preview de mensageiro, um crawler, um clique
 * distraído — para o vínculo passar a existir.
 *
 * Com o botão, o aceite vira uma Server Action: `POST`, deliberado, e com a
 * pessoa vendo o que está aceitando.
 */
export function AcceptInvitation({ token }: AcceptInvitationProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' })

  function handleAccept() {
    startTransition(async () => {
      const result = await acceptInvitationAction(token)

      if (!result.ok) {
        setOutcome({
          kind: 'failed',
          message: result.error ?? invitationMessages.unexpected,
        })
        return
      }

      setOutcome({ kind: 'accepted', warning: result.error })
      router.refresh()
    })
  }

  if (outcome.kind === 'accepted') {
    return (
      <div role="status" className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <CheckCircle2 aria-hidden className="size-5 text-status-positive" />
          <p className="text-body font-semibold text-foreground">
            {invitationMessages.accepted}
          </p>
        </div>

        {outcome.warning ? (
          <p className="text-aux text-muted">{outcome.warning}</p>
        ) : (
          <p className="text-aux text-muted">
            Sua clínica anterior continua ativa. Use o seletor no topo para
            alternar entre elas.
          </p>
        )}

        <Button asChild size="lg" fullWidth>
          <Link href="/dashboard">Ir para o painel</Link>
        </Button>
      </div>
    )
  }

  if (outcome.kind === 'failed') {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <XCircle aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" />
          <p role="alert" className="text-aux text-foreground">
            {outcome.message}
          </p>
        </div>

        <Button asChild variant="secondary" size="lg" fullWidth>
          <Link href="/dashboard">Voltar ao painel</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3">
        <MailCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-link" />
        <p className="text-aux leading-6 text-muted">
          Ao aceitar, você passa a ter acesso aos dados desta clínica com o
          perfil que quem convidou definiu. Você continua com acesso às clínicas
          de que já participa.
        </p>
      </div>

      <Button
        size="lg"
        fullWidth
        onClick={handleAccept}
        isLoading={isPending}
      >
        {isPending ? 'Aceitando...' : 'Aceitar convite'}
      </Button>
    </div>
  )
}
