'use client'

import { Save } from 'lucide-react'
import { useState, useTransition, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { TextField } from '@/components/ui/text-field'
import { formatPhone } from '@/lib/utils/phone'

import { updateProfileAction } from '../actions/updateProfile.action'
import {
  profileMessages,
  type ProfileDto,
} from '../schemas/profile.schema'

export interface PersonalProfileFormProps {
  profile: ProfileDto
}

type Field = 'fullName' | 'phone'

/**
 * Perfil pessoal.
 *
 * Fica em `/configuracoes` porque é para lá que o menu da pessoa aponta — a
 * entrada se chama "Perfil e configurações" e, até aqui, entregava só a segunda
 * metade. O card é composto **na rota**, e não dentro da tela de configurações:
 * perfil é do módulo `identity` e clínica é do `settings`, e um módulo não
 * alcança o interior do outro (regra 4).
 *
 * # O e-mail aparece e não se edita
 *
 * Ele é o acesso ao sistema, e quem decide o que vale é o Supabase Auth: trocar
 * exige confirmação no endereço novo. Um campo editável aqui gravaria na coluna
 * e deixaria a pessoa vendo um e-mail e entrando com outro.
 */
export function PersonalProfileForm({ profile }: PersonalProfileFormProps) {
  const [isPending, startTransition] = useTransition()
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Field, string>>>(
    {},
  )

  const [fullName, setFullName] = useState(profile.fullName)
  const [phone, setPhone] = useState(
    profile.phone ? formatPhone(profile.phone) : '',
  )

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setFieldErrors({})
    setSaved(false)

    startTransition(async () => {
      try {
        const result = await updateProfileAction({ fullName, phone })

        if (!result.ok) {
          setError(result.error.message)
          setFieldErrors(result.error.fieldErrors ?? {})
          return
        }

        /*
         * Reexibe o que o servidor gravou: o telefone volta normalizado, e ver a
         * máscara padronizada confirma que o valor foi entendido.
         */
        setFullName(result.data.fullName)
        setPhone(result.data.phone ? formatPhone(result.data.phone) : '')
        setSaved(true)
      } catch {
        setError(profileMessages.unavailable)
      }
    })
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Seu perfil"
        description="O nome que aparece para a equipe e no que você assina."
      />

      <form onSubmit={handleSubmit} className="space-y-5 px-5 pb-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <TextField
            label="Nome completo"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            error={fieldErrors.fullName}
            disabled={isPending}
            maxLength={120}
          />

          <TextField
            label="Telefone"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            error={fieldErrors.phone}
            hint="Opcional. Com DDD."
            inputMode="tel"
            disabled={isPending}
            maxLength={20}
          />
        </div>

        <div>
          <TextField
            label="E-mail de acesso"
            value={profile.email}
            readOnly
            disabled
          />
          <p className="mt-1.5 text-label text-muted">
            {profileMessages.emailReadOnly}
          </p>
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
            {saved ? 'Perfil salvo.' : ''}
          </p>

          <Button type="submit" disabled={isPending}>
            <Save aria-hidden className="size-4" />
            {isPending ? 'Salvando…' : 'Salvar perfil'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
