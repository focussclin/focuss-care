'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { signUpAction } from '../actions/signUp.action'
import { signUpMessages, type SignUpInput } from '../schemas/signUp.schema'
import { SignUpFormView } from './SignUpForm.view'

/**
 * Liga a view ao caso de uso — dono: Claude (codigo).
 *
 * Destino do sucesso e /onboarding, nao /dashboard: uma conta sem clinica nao
 * tem dado nenhum para ver, e o dashboard a devolveria para ca de qualquer forma.
 */
export function SignUpFormContainer() {
  const router = useRouter()
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] =
    useState<Partial<Record<keyof SignUpInput, string>>>()
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(values: SignUpInput) {
    setFormError(null)
    setFieldErrors(undefined)
    setConfirmationMessage(null)

    startTransition(async () => {
      try {
        const result = await signUpAction(values)

        if (!result.ok) {
          setFormError(result.error ?? signUpMessages.signUpFailed)
          setFieldErrors(result.fieldErrors)
          return
        }

        if (result.requiresEmailConfirmation) {
          setConfirmationMessage(signUpMessages.confirmEmail)
          return
        }

        setIsSuccess(true)
        router.refresh()
        router.replace('/onboarding')
      } catch {
        setFormError(signUpMessages.unexpected)
      }
    })
  }

  return (
    <SignUpFormView
      onSubmit={handleSubmit}
      isSubmitting={isPending}
      formError={formError}
      fieldErrors={fieldErrors}
      confirmationMessage={confirmationMessage}
      isSuccess={isSuccess}
      signInHref="/login"
    />
  )
}
