'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { createClinicAction } from '../actions/createClinic.action'
import {
  clinicMessages,
  type CreateClinicInput,
} from '../schemas/clinic.schema'
import { OnboardingFormView } from './OnboardingForm.view'

/**
 * Liga a view ao caso de uso — dono: Claude (codigo).
 * Nao contem decisao visual: apenas estado de envio, erro e navegacao.
 */
interface OnboardingFormContainerProps {
  greetingName?: string
}

export function OnboardingFormContainer({
  greetingName,
}: OnboardingFormContainerProps) {
  const router = useRouter()
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] =
    useState<Partial<Record<keyof CreateClinicInput, string>>>()
  const [isSuccess, setIsSuccess] = useState(false)
  const [claimsStale, setClaimsStale] = useState(false)
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(values: CreateClinicInput) {
    setFormError(null)
    setFieldErrors(undefined)

    startTransition(async () => {
      try {
        const result = await createClinicAction(values)

        if (!result.ok) {
          setFormError(result.error ?? clinicMessages.unexpected)
          setFieldErrors(result.fieldErrors)
          setClaimsStale(Boolean(result.staleClaims))
          return
        }

        setIsSuccess(true)
        // refresh() antes do replace: a casca precisa reler a sessao para
        // enxergar a clinica recem-criada.
        router.refresh()
        router.replace('/dashboard')
      } catch {
        setFormError(clinicMessages.unexpected)
      }
    })
  }

  return (
    <OnboardingFormView
      onSubmit={handleSubmit}
      isSubmitting={isPending}
      formError={formError}
      fieldErrors={fieldErrors}
      isSuccess={isSuccess}
      claimsStale={claimsStale}
      greetingName={greetingName}
    />
  )
}
