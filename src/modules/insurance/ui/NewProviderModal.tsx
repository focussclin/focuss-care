'use client'

import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { SelectField } from '@/components/ui/select-field'
import { TextField } from '@/components/ui/text-field'

import { createPlanAction, createProviderAction } from '../actions/providers.action'
import type { ProviderDto } from '../schemas/insurance.schema'

export interface NewProviderModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  providers: readonly ProviderDto[]
  onDone: () => void
}

/**
 * Cadastro de operadora e plano — feature **V-01**.
 *
 * Os dois no mesmo modal porque nunca se cadastra um sem pensar no outro: uma
 * operadora sem plano não serve para nada, e um plano precisa da operadora
 * existindo antes. A aba de plano fica desabilitada enquanto não houver
 * operadora — a dependência aparece na interface em vez de virar um erro depois
 * do formulário preenchido.
 */
export function NewProviderModal({
  open,
  onOpenChange,
  providers,
  onDone,
}: NewProviderModalProps) {
  const [mode, setMode] = useState<'provider' | 'plan'>('provider')
  const [isSubmitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [ansCode, setAnsCode] = useState('')
  const [cnpj, setCnpj] = useState('')

  const [providerId, setProviderId] = useState('')
  const [planName, setPlanName] = useState('')
  const [planCode, setPlanCode] = useState('')
  const [copay, setCopay] = useState('0,00')
  const [paymentTermDays, setPaymentTermDays] = useState('30')

  function reset() {
    setName('')
    setAnsCode('')
    setCnpj('')
    setProviderId('')
    setPlanName('')
    setPlanCode('')
    setCopay('0,00')
    setPaymentTermDays('30')
    setError(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const result =
        mode === 'provider'
          ? await createProviderAction({ name, ansCode, cnpj, notes: '' })
          : await createPlanAction({
              providerId,
              name: planName,
              planCode,
              copay,
              paymentTermDays,
            })

      if (!result.ok) {
        setError(result.error.message)
        return
      }

      reset()
      onOpenChange(false)
      onDone()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
      title="Cadastrar convênio"
      description="Operadora é a empresa; plano é o que o paciente contrata."
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button type="submit" form="provider-form" isLoading={isSubmitting}>
            {isSubmitting ? 'Salvando...' : 'Salvar'}
          </Button>
        </>
      }
    >
      <form
        id="provider-form"
        noValidate
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
      >
        {error ? (
          <p
            role="alert"
            className="rounded-card border border-danger/30 bg-danger/5 px-3.5 py-2.5 text-aux text-danger"
          >
            {error}
          </p>
        ) : null}

        <div
          role="tablist"
          aria-label="O que cadastrar"
          className="flex gap-2"
        >
          <Button
            type="button"
            role="tab"
            aria-selected={mode === 'provider'}
            variant={mode === 'provider' ? 'primary' : 'secondary'}
            onClick={() => setMode('provider')}
          >
            Operadora
          </Button>
          <Button
            type="button"
            role="tab"
            aria-selected={mode === 'plan'}
            variant={mode === 'plan' ? 'primary' : 'secondary'}
            disabled={providers.length === 0}
            title={
              providers.length === 0
                ? 'Cadastre uma operadora antes de criar um plano.'
                : undefined
            }
            onClick={() => setMode('plan')}
          >
            Plano
          </Button>
        </div>

        {mode === 'provider' ? (
          <>
            <TextField
              label="Nome da operadora"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Unimed, Bradesco Saúde…"
              maxLength={120}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label="Registro ANS"
                value={ansCode}
                onChange={(event) => setAnsCode(event.target.value)}
                hint="Opcional."
                maxLength={20}
              />
              <TextField
                label="CNPJ"
                value={cnpj}
                onChange={(event) => setCnpj(event.target.value)}
                hint="Opcional."
                maxLength={20}
              />
            </div>
          </>
        ) : (
          <>
            <SelectField
              label="Operadora"
              value={providerId}
              onChange={(event) => setProviderId(event.target.value)}
              options={[
                { value: '', label: 'Selecione a operadora' },
                ...providers.map((provider) => ({
                  value: provider.id,
                  label: provider.name,
                })),
              ]}
            />
            <TextField
              label="Nome do plano"
              value={planName}
              onChange={(event) => setPlanName(event.target.value)}
              placeholder="Enfermaria, Apartamento, Ouro…"
              maxLength={120}
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField
                label="Código"
                value={planCode}
                onChange={(event) => setPlanCode(event.target.value)}
                hint="Opcional."
                maxLength={40}
              />
              <TextField
                label="Coparticipação"
                value={copay}
                inputMode="decimal"
                onChange={(event) => setCopay(event.target.value)}
                hint="O que o paciente paga."
              />
              <TextField
                label="Prazo (dias)"
                value={paymentTermDays}
                inputMode="numeric"
                onChange={(event) => setPaymentTermDays(event.target.value)}
                hint="Contratual."
              />
            </div>
          </>
        )}
      </form>
    </Modal>
  )
}
