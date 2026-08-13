'use client'

import { Save } from 'lucide-react'
import { useState, useTransition, type FormEvent } from 'react'

import { formatClinicAddress } from '@/lib/clinic/address'
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

type Field = 'tradeName' | 'legalName' | 'cnpj' | 'phone' | 'email' | 'address'

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

  /*
   * Contato público — cada campo em seu estado.
   *
   * O endereço poderia ser um objeto só no estado, e são sete campos porque é
   * assim que o formulário os edita: um `useState` de objeto obrigaria cada
   * tecla a recriar o objeto inteiro, e a comparação de igualdade do React
   * deixaria de ajudar.
   */
  const [phone, setPhone] = useState(profile.phone ?? '')
  const [email, setEmail] = useState(profile.email ?? '')
  const [street, setStreet] = useState(profile.address.street ?? '')
  const [number, setNumber] = useState(profile.address.number ?? '')
  const [complement, setComplement] = useState(profile.address.complement ?? '')
  const [district, setDistrict] = useState(profile.address.district ?? '')
  const [city, setCity] = useState(profile.address.city ?? '')
  const [state, setState] = useState(profile.address.state ?? '')
  const [zipCode, setZipCode] = useState(profile.address.zipCode ?? '')

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
          phone,
          email,
          address: {
            street,
            number,
            complement,
            district,
            city,
            state,
            zipCode,
          },
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
        setPhone(result.data.phone ?? '')
        setEmail(result.data.email ?? '')
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
          <ReadOnly label="Telefone" value={profile.phone ?? '—'} />
          <ReadOnly label="E-mail" value={profile.email ?? '—'} />
          <ReadOnly
            label="Endereço"
            value={formatClinicAddress(profile.address) ?? '—'}
          />
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

        {/*
          Contato PÚBLICO — o que o paciente usa para chegar até a clínica.

          Vive junto da identidade porque é a mesma pergunta ("quem é esta
          clínica?") e a mesma permissão. O assistente de WhatsApp lê daqui: sem
          endereço cadastrado, ele responde que vai confirmar com a equipe, em
          vez de inventar uma rua.
        */}
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="Telefone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            error={fieldErrors.phone}
            hint="Opcional. O número que a clínica divulga ao paciente."
            inputMode="tel"
            disabled={isPending || !isLive}
            maxLength={32}
          />

          <TextField
            label="E-mail de contato"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={fieldErrors.email}
            hint="Opcional. Não é o e-mail de login de ninguém."
            inputMode="email"
            disabled={isPending || !isLive}
            maxLength={160}
          />
        </div>

        <fieldset className="space-y-5">
          <legend className="text-label font-semibold text-label">
            Endereço
          </legend>

          <div className="grid gap-5 sm:grid-cols-[2fr_1fr]">
            <TextField
              label="Logradouro"
              value={street}
              onChange={(event) => setStreet(event.target.value)}
              disabled={isPending || !isLive}
              maxLength={160}
            />
            <TextField
              label="Número"
              value={number}
              onChange={(event) => setNumber(event.target.value)}
              hint="Aceita 's/n'."
              disabled={isPending || !isLive}
              maxLength={20}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="Complemento"
              value={complement}
              onChange={(event) => setComplement(event.target.value)}
              disabled={isPending || !isLive}
              maxLength={80}
            />
            <TextField
              label="Bairro"
              value={district}
              onChange={(event) => setDistrict(event.target.value)}
              disabled={isPending || !isLive}
              maxLength={80}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-[2fr_auto_1fr]">
            <TextField
              label="Cidade"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              disabled={isPending || !isLive}
              maxLength={80}
            />
            <TextField
              label="UF"
              value={state}
              onChange={(event) => setState(event.target.value.toUpperCase())}
              disabled={isPending || !isLive}
              maxLength={2}
            />
            <TextField
              label="CEP"
              value={zipCode}
              onChange={(event) => setZipCode(event.target.value)}
              inputMode="numeric"
              disabled={isPending || !isLive}
              maxLength={9}
            />
          </div>
        </fieldset>

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
