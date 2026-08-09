import type { Metadata } from 'next'
import { connection } from 'next/server'

import {
  setFormStatusFromScreen,
  submitFormFromScreen,
} from '@/modules/forms/actions/formScreen.actions'
import { toFormDto } from '@/modules/forms/application/toFormDto'
import { isFormRepositoryError } from '@/modules/forms/domain/FormRepositoryError'
import { getFormRepository } from '@/modules/forms/infrastructure/repository'
import { FormsScreen } from '@/modules/forms/ui/FormsScreen'

export const metadata: Metadata = {
  title: 'Formulários digitais',
  description: 'Modelos digitais para os fluxos da clínica.',
}

export default async function FormsPage() {
  await connection()

  const source = await getFormRepository()
  let forms = [] as Awaited<ReturnType<typeof source.repository.list>>
  let schemaPending = false

  try {
    forms = await source.repository.list(source.clinicId)
  } catch (cause) {
    if (isFormRepositoryError(cause) && cause.reason === 'schema-not-ready') {
      schemaPending = true
    } else {
      throw cause
    }
  }

  return (
    <FormsScreen
      forms={forms.map(toFormDto)}
      onSubmit={submitFormFromScreen}
      onSetStatus={setFormStatusFromScreen}
      isLive={source.isLive}
      schemaPending={schemaPending}
    />
  )
}
