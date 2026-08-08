'use client'

import { AlertCircle } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Modal } from '@/components/ui/modal'
import { TextField } from '@/components/ui/text-field'

import type { PatientContactDto } from '../application/toPatientContactDto'

export interface PatientContactFormValues {
  name: string
  relationship: string
  phone: string
  email: string
  isLegalGuardian: boolean
}

export interface PatientContactSubmitFailure {
  message: string
  fieldErrors?: Partial<Record<keyof PatientContactFormValues, string>>
}

interface PatientContactModalProps {
  open: boolean
  contact: PatientContactDto | null
  onOpenChange: (open: boolean) => void
  onSubmit: (
    values: PatientContactFormValues,
  ) => Promise<PatientContactSubmitFailure | null>
}

export function PatientContactModal({
  open,
  contact,
  onOpenChange,
  onSubmit,
}: PatientContactModalProps) {
  const [values, setValues] = useState<PatientContactFormValues>(() => defaults(contact))
  const [errors, setErrors] = useState<Partial<Record<keyof PatientContactFormValues, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setSubmitting] = useState(false)

  function update<K extends keyof PatientContactFormValues>(
    field: K,
    value: PatientContactFormValues[K],
  ) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
    setFormError(null)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!values.name.trim()) {
      setErrors({ name: 'Informe o nome do contato.' })
      return
    }

    setSubmitting(true)
    setFormError(null)

    try {
      const failure = await onSubmit(values)
      if (failure) {
        setFormError(failure.message)
        setErrors(failure.fieldErrors ?? {})
        return
      }

      onOpenChange(false)
    } catch {
      setFormError('Não foi possível salvar o contato agora. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (isSubmitting) return
        if (!next) {
          setFormError(null)
          setErrors({})
        }
        onOpenChange(next)
      }}
      title={contact ? 'Editar contato' : 'Adicionar contato'}
      description="Contato administrativo vinculado ao cadastro do paciente."
      footer={
        <>
          <Button
            variant="secondary"
            disabled={isSubmitting}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="submit" form="patient-contact-form" isLoading={isSubmitting}>
            {isSubmitting ? 'Salvando...' : 'Salvar contato'}
          </Button>
        </>
      }
    >
      <form
        id="patient-contact-form"
        noValidate
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
      >
        {formError ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-field border border-danger/30 bg-danger-surface px-4 py-3 text-aux text-danger"
          >
            <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>{formError}</span>
          </div>
        ) : null}

        <p role="status" aria-live="polite" className="sr-only">
          {isSubmitting ? 'Salvando contato...' : ''}
        </p>

        <TextField
          label="Nome completo"
          autoComplete="name"
          value={values.name}
          disabled={isSubmitting}
          error={errors.name}
          onChange={(event) => update('name', event.target.value)}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Vínculo"
            placeholder="Ex.: mãe, cônjuge, responsável"
            value={values.relationship}
            disabled={isSubmitting}
            error={errors.relationship}
            onChange={(event) => update('relationship', event.target.value)}
          />
          <TextField
            label="Telefone"
            type="tel"
            autoComplete="tel"
            value={values.phone}
            disabled={isSubmitting}
            error={errors.phone}
            onChange={(event) => update('phone', event.target.value)}
          />
        </div>

        <TextField
          label="E-mail"
          type="email"
          autoComplete="email"
          value={values.email}
          disabled={isSubmitting}
          error={errors.email}
          onChange={(event) => update('email', event.target.value)}
        />

        <Checkbox
          label="Este contato é responsável legal pelo paciente"
          checked={values.isLegalGuardian}
          disabled={isSubmitting}
          onCheckedChange={(checked) => update('isLegalGuardian', checked)}
        />
      </form>
    </Modal>
  )
}

function defaults(contact: PatientContactDto | null): PatientContactFormValues {
  return {
    name: contact?.name ?? '',
    relationship: contact?.relationship ?? '',
    phone: contact?.phone ?? '',
    email: contact?.email ?? '',
    isLegalGuardian: contact?.isLegalGuardian ?? false,
  }
}
