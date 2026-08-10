'use client'

import { Check, Clipboard, MailPlus } from 'lucide-react'
import { useState, useTransition, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { SelectField } from '@/components/ui/select-field'
import { TextField } from '@/components/ui/text-field'
import { formatShortDate } from '@/lib/utils/date'

import { createInvitationAction } from '../actions/createInvitation.action'
import {
  roleOptions,
  teamMessages,
  type CreatedInvitationDto,
} from '../schemas/team.schema'

export interface InviteMemberPanelProps {
  canManage: boolean
  isLive: boolean
}

export function InviteMemberPanel({
  canManage,
  isLive,
}: InviteMemberPanelProps) {
  const [isPending, startTransition] = useTransition()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('professional')
  const [error, setError] = useState<string | null>(null)
  const [invitation, setInvitation] = useState<CreatedInvitationDto | null>(
    null,
  )
  const [copied, setCopied] = useState(false)

  if (!canManage || !isLive) return null

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setCopied(false)

    startTransition(async () => {
      try {
        const result = await createInvitationAction({ email, role })

        if (!result.ok) {
          setError(result.error.message)
          return
        }

        setInvitation(result.data)
        setEmail('')
      } catch {
        setError(teamMessages.unavailable)
      }
    })
  }

  async function handleCopy() {
    if (!invitation) return

    try {
      await navigator.clipboard.writeText(invitation.inviteUrl)
      setCopied(true)
    } catch {
      setError('Não foi possível copiar automaticamente. Selecione o link e copie manualmente.')
    }
  }

  return (
    <Card>
      <CardHeader
        title="Convidar para a equipe"
        description="Emita um link seguro para a pessoa entrar nesta clínica com o perfil escolhido."
      />

      <form
        onSubmit={handleSubmit}
        className="grid gap-4 border-t border-border-card px-5 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.6fr)_auto] sm:items-end"
      >
        <TextField
          label="E-mail da pessoa"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="nome@clinica.com.br"
          maxLength={254}
        />
        <SelectField
          label="Perfil"
          value={role}
          onChange={(event) => setRole(event.target.value)}
          options={roleOptions.map((option) => ({
            value: option.value,
            label: option.label,
          }))}
        />
        <Button type="submit" isLoading={isPending} disabled={!email.trim()}>
          <MailPlus aria-hidden className="size-4" />
          Emitir convite
        </Button>
      </form>

      {error ? (
        <p
          role="alert"
          className="mx-5 mb-4 rounded-field border border-danger/30 bg-danger-surface px-3 py-2 text-label text-danger"
        >
          {error}
        </p>
      ) : null}

      {invitation ? (
        <div
          role="status"
          className="mx-5 mb-5 rounded-card border border-status-positive/30 bg-status-positive-surface p-4"
        >
          <p className="text-aux font-semibold text-foreground">
            Convite emitido para {invitation.email}
          </p>
          <p className="mt-1 text-label text-muted">
            O link expira em {formatShortDate(new Date(invitation.expiresAt))}.
            Copie-o e envie para a pessoa convidada.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              aria-label="Link do convite"
              readOnly
              value={invitation.inviteUrl}
              className="h-11 min-w-0 flex-1 rounded-field border border-border-default bg-surface px-3 text-label text-foreground focus:outline-none focus:shadow-focus"
            />
            <Button type="button" variant="secondary" onClick={handleCopy}>
              {copied ? (
                <Check aria-hidden className="size-4 text-status-positive" />
              ) : (
                <Clipboard aria-hidden className="size-4" />
              )}
              {copied ? 'Copiado' : 'Copiar link'}
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  )
}
