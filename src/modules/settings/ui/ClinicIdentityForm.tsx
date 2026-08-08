'use client'

import { Save } from 'lucide-react'
import { useState, useTransition, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { TextField } from '@/components/ui/text-field'

import { updateClinicProfileAction } from '../actions/updateClinicProfile.action'
import {
  formatCnpj,
  settingsMessages,
  type ClinicProfileDto,
} from '../schemas/settings.schema'

export interface ClinicIdentityFormProps {
  profile: ClinicProfileDto
  canManage: boolean
  isLive: boolean
}

type Field = 'tradeName' | 'legalName' | 'cnpj'

/**
 * Identidade da clínica — nome fantasia, razão social, CNPJ.
 *
 * Quem não tem `clinic.settings` vê os mesmos dados, sem formulário. A escolha é
 * deliberada: nada aqui é dado pessoal de terceiro — é o cadastro da empresa,
 * que a recepção lê no carimbo e o profissional lê no receituário. Esconder
 * faria a pessoa perguntar o CNPJ da própria clínica para alguém.
 *
 * A recusa de verdade é do servidor: a action exige `rolesWith('clinic.settings')`.
 */
export function ClinicIdentityForm({
  profile,
  canManage,
  isLive,
}: ClinicIdentityFormProps) {
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>(
    {},
  )

  const [tradeName, setTradeName] = useState(profile.tradeName)
  const [legalName, setLegalName] = useState(profile.legalName ?? '')
  const [cnpj, setCnpj] = useState(formatCnpj(profile.cnpj))

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    setSaved(false)

    startTransition(async () => {
      try {
        const result = await updateClinicProfileAction({
          tradeName,
          legalName,
          cnpj,
        })

        if (!result.ok) {
          setError(result.error.message)
          setFieldErrors(result.error.fieldErrors ?? {})
          return
        }

        // Reexibe o que o servidor gravou: o CNPJ volta normalizado, e ver a
        // pontuação padronizada confirma que o valor foi entendido.
        setCnpj(formatCnpj(result.data.cnpj))
        setLegalName(result.data.legalName ?? '')
        setTradeName(result.data.tradeName)
        setSaved(true)
      } catch {
        setError(settingsMessages.unavailable)
      }
    })
  }

  if (!canManage) {
    return (
      <Card className="overflow-hidden">
        <CardHeader
          title="Identidade da clínica"
          description="Como a clínica se identifica em documentos e cobranças."
        />
        <dl className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
          <ReadOnly label="Nome da clínica" value={profile.tradeName} />
          <ReadOnly label="Razão social" value={profile.legalName ?? '—'} />
          <ReadOnly label="CNPJ" value={formatCnpj(profile.cnpj) || '—'} />
        </dl>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Identidade da clínica"
        description="Como a clínica se identifica em documentos e cobranças."
      />

      <form onSubmit={handleSubmit} className="space-y-5 px-5 pb-5">
        <TextField
          label="Nome da clínica"
          value={tradeName}
          onChange={(event) => setTradeName(event.target.value)}
          error={fieldErrors.tradeName}
          hint="É o nome que aparece no topo do sistema e no seletor de clínicas."
          disabled={isPending || !isLive}
          maxLength={120}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="Razão social"
            value={legalName}
            onChange={(event) => setLegalName(event.target.value)}
            error={fieldErrors.legalName}
            hint="Opcional. Usada em nota fiscal e contrato."
            disabled={isPending || !isLive}
            maxLength={160}
          />

          <TextField
            label="CNPJ"
            value={cnpj}
            onChange={(event) => setCnpj(event.target.value)}
            error={fieldErrors.cnpj}
            hint="Opcional. Pode digitar com ou sem pontuação."
            inputMode="numeric"
            disabled={isPending || !isLive}
            maxLength={18}
          />
        </div>

        {error ? (
          <p
            role="alert"
            className="rounded-card border border-danger/30 bg-danger-surface px-4 py-3 text-aux text-danger"
          >
            {error}
          </p>
        ) : null}

        <div className="flex items-center justify-between gap-3 border-t border-border-card pt-5">
          <p role="status" className="text-label text-muted">
            {saved ? 'Identidade salva.' : ''}
          </p>

          <Button type="submit" disabled={isPending || !isLive}>
            <Save aria-hidden className="size-4" />
            {isPending ? 'Salvando…' : 'Salvar identidade'}
          </Button>
        </div>
      </form>
    </Card>
  )
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-label text-muted">{label}</dt>
      <dd className="mt-1 text-aux font-semibold text-foreground">{value}</dd>
    </div>
  )
}
