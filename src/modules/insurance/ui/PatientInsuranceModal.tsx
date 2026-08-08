'use client'

import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Modal } from '@/components/ui/modal'
import { SelectField } from '@/components/ui/select-field'
import { TextField } from '@/components/ui/text-field'

import { PatientPicker } from '@/modules/patients'

import type { PlanDto } from '../schemas/insurance.schema'

interface Option {
  id: string
  name: string
}

interface PatientInsuranceModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  patients: readonly Option[]
  plans: readonly PlanDto[]
  isLive: boolean
  onSubmit: (values: {
    patientId: string
    planId: string
    cardNumber: string
    holderName: string
    validUntil: string
    isPrimary: boolean
  }) => Promise<string | null>
}

export function PatientInsuranceModal({
  open,
  onOpenChange,
  patients,
  plans,
  isLive,
  onSubmit,
}: PatientInsuranceModalProps) {
  const [patientId, setPatientId] = useState('')
  const [planId, setPlanId] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [holderName, setHolderName] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [isPrimary, setPrimary] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setSubmitting] = useState(false)

  function reset() {
    setPatientId('')
    setPlanId('')
    setCardNumber('')
    setHolderName('')
    setValidUntil('')
    setPrimary(true)
    setError(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      const failure = await onSubmit({
        patientId,
        planId,
        cardNumber,
        holderName,
        validUntil,
        isPrimary,
      })

      if (failure) {
        setError(failure)
        return
      }

      reset()
      onOpenChange(false)
    } catch {
      setError('Não foi possível salvar a carteirinha agora.')
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
      title="Nova carteirinha"
      description="Registre a validade cadastrada pela clínica, sem afirmar elegibilidade externa."
      footer={
        <>
          <Button variant="secondary" disabled={isSubmitting} onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="patient-insurance-form" isLoading={isSubmitting}>
            {isSubmitting ? 'Salvando...' : 'Salvar carteirinha'}
          </Button>
        </>
      }
    >
      <form
        id="patient-insurance-form"
        noValidate
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
      >
        {error ? (
          <p role="alert" className="rounded-card border border-danger/30 bg-danger-surface px-3.5 py-2.5 text-aux text-danger">
            {error}
          </p>
        ) : null}

        <PatientPicker
          value={patientId}
          onChange={setPatientId}
          initialOptions={patients}
          isLive={isLive}
          disabled={isSubmitting}
        />

        <SelectField
          label="Plano"
          value={planId}
          onChange={(event) => setPlanId(event.target.value)}
          options={[
            { value: '', label: 'Selecione o plano' },
            ...plans
              .filter((plan) => plan.isActive)
              .map((plan) => ({
                value: plan.id,
                label: `${plan.providerName} · ${plan.name}`,
              })),
          ]}
        />

        <TextField
          label="Número da carteirinha"
          value={cardNumber}
          onChange={(event) => setCardNumber(event.target.value)}
          maxLength={80}
          autoComplete="off"
        />

        <TextField
          label="Nome do titular (opcional)"
          value={holderName}
          onChange={(event) => setHolderName(event.target.value)}
          maxLength={160}
          autoComplete="name"
        />

        <TextField
          label="Validade cadastrada (opcional)"
          type="date"
          value={validUntil}
          onChange={(event) => setValidUntil(event.target.value)}
        />

        <Checkbox
          label="Usar como convênio principal deste paciente"
          checked={isPrimary}
          onCheckedChange={setPrimary}
          disabled={isSubmitting}
        />

        <p className="text-label text-muted">
          A data é informada pela clínica e não substitui a confirmação junto à operadora.
        </p>
      </form>
    </Modal>
  )
}
