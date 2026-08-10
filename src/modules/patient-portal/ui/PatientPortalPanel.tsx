'use client'

import { Check, Copy, KeyRound } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { TextField } from '@/components/ui/text-field'

import type {
  PortalInviteCreatedDto,
  PortalInviteSummaryDto,
} from '../schemas/patientPortal.schema'

export interface PatientPortalPanelProps {
  patientId: string
  /** `patients.email`, para pré-preencher. Continua editável. */
  defaultEmail: string | null
  invites: readonly PortalInviteSummaryDto[]
  /** Quem não tem `patient.write` vê o estado e não gera convite. */
  canManage: boolean
  /** Falso no modo demonstração, e quando a migration não foi aplicada. */
  isLive: boolean
  schemaPending: boolean
  onCreate: (
    patientId: string,
    email: string,
  ) => Promise<
    { ok: true; invite: PortalInviteCreatedDto } | { ok: false; message: string }
  >
}

/**
 * Acesso do paciente ao portal, na ficha 360.
 *
 * # O link aparece UMA vez
 *
 * A action devolve o token em claro; o banco guardou só o sha256. Depois que
 * esta tela é recarregada, o link não existe em lugar nenhum — nem para quem o
 * gerou.
 *
 * Isso é o que torna o token uma credencial de verdade. Um link recuperável da
 * ficha seria um link que qualquer pessoa com acesso à ficha usa para virar o
 * paciente. Por isso o aviso abaixo do campo não é decoração: quem fechar sem
 * copiar precisa gerar outro, e gerar outro **invalida o anterior**.
 *
 * # Por que não envia o e-mail
 *
 * Não há provedor de envio configurado (é o bloqueio do módulo `integrations`).
 * Um botão "enviar por e-mail" que não envia seria pior que a ausência dele: a
 * recepção acharia que o paciente recebeu. O fluxo honesto hoje é copiar e
 * mandar pelo canal que a clínica já usa.
 */
export function PatientPortalPanel({
  patientId,
  defaultEmail,
  invites,
  canManage,
  isLive,
  schemaPending,
  onCreate,
}: PatientPortalPanelProps) {
  const [email, setEmail] = useState(defaultEmail ?? '')
  const [created, setCreated] = useState<PortalInviteCreatedDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, setPending] = useState(false)
  const [copied, setCopied] = useState(false)

  const active = invites.find((invite) => invite.status === 'accepted')
  const pending = invites.find((invite) => invite.status === 'pending')
  const enabled = canManage && isLive && !schemaPending

  async function handleCreate() {
    setError(null)
    setCopied(false)
    setPending(true)

    try {
      const result = await onCreate(patientId, email.trim().toLowerCase())

      if (result.ok) setCreated(result.invite)
      else setError(result.message)
    } finally {
      setPending(false)
    }
  }

  async function handleCopy() {
    if (!created) return

    try {
      await navigator.clipboard.writeText(created.url)
      setCopied(true)
    } catch {
      /*
       * `clipboard` falha sem HTTPS e quando o navegador nega a permissão. O
       * link continua visível e selecionável no campo — por isso ele é um
       * `TextField` somente-leitura, e não um texto solto.
       */
      setError('Não foi possível copiar. Selecione o link e copie manualmente.')
    }
  }

  return (
    <Card>
      <CardHeader
        title="Portal do paciente"
        description="Acesso do paciente às próprias consultas e cobranças. O prontuário não entra."
        action={
          active ? (
            <StatusBadge tone="positive">Ativo</StatusBadge>
          ) : pending ? (
            <StatusBadge tone="pending">Convite pendente</StatusBadge>
          ) : undefined
        }
      />

      <div className="flex flex-col gap-4 px-5 pb-5">
        {schemaPending ? (
          <p
            role="status"
            className="rounded-field border border-attention/30 bg-attention-surface px-4 py-3 text-label leading-5 text-foreground"
          >
            A migration `20260810_patient_portal.sql` ainda não foi aplicada no
            banco, então não há como gerar convite.
          </p>
        ) : null}

        {active ? (
          <p className="text-aux leading-6 text-muted">
            Este paciente já acessa o portal ({active.email}, {active.detailLabel}).
          </p>
        ) : null}

        {created ? (
          <div className="flex flex-col gap-2 rounded-field border border-status-positive/30 bg-status-positive-surface p-4">
            <p className="text-label font-semibold text-foreground">
              Link gerado — copie agora
            </p>

            <TextField
              label="Link de acesso"
              value={created.url}
              readOnly
              onFocus={(event) => event.currentTarget.select()}
              onChange={() => {}}
            />

            <div className="flex flex-wrap items-center gap-3">
              <Button variant="secondary" onClick={handleCopy}>
                {copied ? (
                  <Check aria-hidden className="size-4" />
                ) : (
                  <Copy aria-hidden className="size-4" />
                )}
                {copied ? 'Copiado' : 'Copiar link'}
              </Button>
              <span className="text-label text-muted">
                vence em {created.expiresLabel}
              </span>
            </div>

            {/*
              Não é aviso de cortesia: o token não é recuperável.
            */}
            <p className="text-label leading-5 text-muted">
              Este link não aparece de novo. Se você sair desta tela sem copiar,
              será preciso gerar outro — e gerar outro cancela este.
            </p>
          </div>
        ) : null}

        {!active && enabled ? (
          <div className="flex flex-col gap-3">
            <TextField
              label="E-mail que receberá o acesso"
              type="email"
              inputMode="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              hint="O acesso só é liberado para quem provar que controla este endereço."
            />

            <div>
              <Button onClick={handleCreate} isLoading={isPending} disabled={!email.trim()}>
                <KeyRound aria-hidden className="size-4" />
                {isPending
                  ? 'Gerando…'
                  : pending
                    ? 'Gerar novo link'
                    : 'Gerar link de acesso'}
              </Button>
            </div>

            {pending ? (
              <p className="text-label leading-5 text-muted">
                Há um convite pendente para {pending.email} ({pending.detailLabel}).
                Gerar outro cancela esse.
              </p>
            ) : null}
          </div>
        ) : null}

        {!canManage ? (
          <p className="text-label leading-5 text-muted">
            Você não tem permissão para conceder acesso ao portal.
          </p>
        ) : null}

        {error ? (
          <p
            role="alert"
            className="rounded-field border border-danger/30 bg-danger-surface px-4 py-3 text-aux leading-6 text-danger"
          >
            {error}
          </p>
        ) : null}
      </div>
    </Card>
  )
}
