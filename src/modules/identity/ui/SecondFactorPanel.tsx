'use client'

import { ShieldCheck, ShieldOff, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { TextField } from '@/components/ui/text-field'
import { isValidTotpCode, normalizeTotpCode } from '@/lib/security/mfa'

import {
  enrollTotpAction,
  unenrollFactorAction,
  verifyTotpAction,
} from '../actions/mfa.action'
import { mfaMessages } from '../schemas/mfa.schema'

export interface SecondFactorPanelProps {
  active: readonly { id: string; friendlyName: string | null }[]
  pending: readonly { id: string; friendlyName: string | null }[]
  /** A listagem falhou: a tela não finge "sem fator". */
  loadError?: boolean
}

interface EnrollState {
  factorId: string
  qrCode: string
  secret: string
}

/**
 * Verificação em duas etapas — feature **S-MFA**.
 *
 * # O segredo aparece UMA vez
 *
 * `enroll` devolve QR e segredo, e nada disso é guardado: recarregar a página
 * perde o que não foi escaneado. É o comportamento certo — um segredo TOTP
 * disponível para reexibição vale tanto quanto a senha.
 *
 * # Fator pendente é limpável
 *
 * Cada tentativa abandonada deixa um `unverified` para trás, e o provedor recusa
 * nome repetido. Sem o botão de remover, quem errou o código uma vez ficaria sem
 * conseguir tentar de novo com o mesmo nome.
 */
export function SecondFactorPanel({
  active,
  pending,
  loadError = false,
}: SecondFactorPanelProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [enrollment, setEnrollment] = useState<EnrollState | null>(null)

  function run(operation: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)

    startTransition(async () => {
      try {
        const result = await operation()
        if (!result.ok) {
          setError(result.error ?? mfaMessages.unavailable)
          return
        }
        router.refresh()
      } catch {
        setError(mfaMessages.unavailable)
      }
    })
  }

  function startEnrollment() {
    setError(null)

    startTransition(async () => {
      try {
        const result = await enrollTotpAction(name)

        if (!result.ok || !result.qrCode || !result.factorId || !result.secret) {
          setError(result.error ?? mfaMessages.enrollFailed)
          return
        }

        setEnrollment({
          factorId: result.factorId,
          qrCode: result.qrCode,
          secret: result.secret,
        })
      } catch {
        setError(mfaMessages.unavailable)
      }
    })
  }

  function confirmEnrollment() {
    if (!enrollment) return

    run(async () => {
      const result = await verifyTotpAction(enrollment.factorId, code)
      if (result.ok) {
        setEnrollment(null)
        setName('')
        setCode('')
      }
      return result
    })
  }

  const isProtected = active.length > 0

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Verificação em duas etapas"
        description="Um código do aplicativo autenticador, além da senha."
        action={
          <StatusBadge tone={isProtected ? 'positive' : 'pending'}>
            {isProtected ? 'Ativa' : 'Não configurada'}
          </StatusBadge>
        }
      />

      {loadError ? (
        <p
          role="alert"
          className="border-y border-danger/30 bg-danger-surface px-5 py-3 text-aux text-danger"
        >
          {mfaMessages.listUnavailable}
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="border-y border-danger/30 bg-danger-surface px-5 py-3 text-aux text-danger"
        >
          {error}
        </p>
      ) : null}

      {isProtected ? (
        <ul className="divide-y divide-border-card border-t border-border-card">
          {active.map((factor) => (
            <li key={factor.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
              <ShieldCheck aria-hidden className="size-4 text-positive" />
              <p className="min-w-0 flex-1 truncate text-aux text-foreground">
                {factor.friendlyName ?? 'Aplicativo autenticador'}
              </p>
              <Button
                variant="ghost"
                disabled={isPending}
                onClick={() => run(() => unenrollFactorAction(factor.id))}
              >
                <Trash2 aria-hidden className="size-4" />
                Remover
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-start gap-2.5 border-t border-border-card px-5 py-4 text-aux text-muted">
          <ShieldOff aria-hidden className="mt-0.5 size-4 shrink-0" />
          Sua conta entra só com a senha. Uma senha vazada em outro serviço vale
          integralmente aqui — e este sistema guarda prontuário.
        </p>
      )}

      {enrollment ? (
        <div className="flex flex-col gap-4 border-t border-border-card px-5 py-4">
          <p className="text-aux text-foreground">
            Escaneie o código no seu aplicativo autenticador e digite o número que
            ele mostrar.
          </p>

          {/*
            O QR vem como SVG do provedor. `dangerouslySetInnerHTML` é o caminho
            para renderizá-lo inline — a alternativa seria um `<img>` com data
            URI, que perde nitidez e não escala com o zoom de quem enxerga mal.
          */}
          <div
            aria-label="Código QR do segundo fator"
            className="w-fit rounded-field bg-white p-3"
            dangerouslySetInnerHTML={{ __html: enrollment.qrCode }}
          />

          <div>
            <p className="text-label font-semibold text-label">
              Sem câmera? Digite este código no aplicativo:
            </p>
            {/*
              Aparece UMA vez. Recarregar perde — e é assim que deve ser.
            */}
            <code className="mt-1 block break-all rounded-field bg-background px-3 py-2 text-aux text-foreground">
              {enrollment.secret}
            </code>
          </div>

          <TextField
            label="Código do aplicativo"
            value={code}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            disabled={isPending}
            onChange={(event) => setCode(normalizeTotpCode(event.target.value))}
          />

          <div className="flex flex-wrap gap-2">
            <Button disabled={isPending || !isValidTotpCode(code)} onClick={confirmEnrollment}>
              {isPending ? 'Confirmando…' : 'Confirmar e ativar'}
            </Button>
            <Button
              variant="ghost"
              disabled={isPending}
              onClick={() => {
                setEnrollment(null)
                setCode('')
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-3 border-t border-border-card px-5 py-4">
          <div className="min-w-[220px] flex-1">
            <TextField
              label="Nome do aparelho"
              value={name}
              maxLength={60}
              disabled={isPending}
              hint='Como reconhecê-lo depois — "Celular da Ana".'
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <Button disabled={isPending || name.trim().length < 2} onClick={startEnrollment}>
            <ShieldCheck aria-hidden className="size-4" />
            {isProtected ? 'Adicionar aparelho' : 'Ativar verificação'}
          </Button>
        </div>
      )}

      {pending.length > 0 ? (
        <div className="border-t border-border-card px-5 py-4">
          <p className="text-label text-muted">
            Cadastros iniciados e não confirmados. Eles não protegem nada e
            ocupam o nome:
          </p>
          <ul className="mt-2 flex flex-col gap-2">
            {pending.map((factor) => (
              <li key={factor.id} className="flex flex-wrap items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-label text-muted">
                  {factor.friendlyName ?? 'Sem nome'}
                </span>
                <Button
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => run(() => unenrollFactorAction(factor.id))}
                >
                  Descartar
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  )
}
