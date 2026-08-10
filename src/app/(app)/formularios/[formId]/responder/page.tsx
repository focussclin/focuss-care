import type { Metadata } from 'next'
import { forbidden, notFound } from 'next/navigation'
import { connection } from 'next/server'
import { z } from 'zod'

import { getActiveClinicRole } from '@/lib/auth/active-clinic'
import { can } from '@/lib/auth/permissions'
import { saveFormResponseFromScreen } from '@/modules/forms/actions/formResponseScreen.actions'
import { toFormDto } from '@/modules/forms/application/toFormDto'
import { getFormRepository } from '@/modules/forms/infrastructure/repository'
import { FormResponseScreen } from '@/modules/forms/ui/FormResponseScreen'
import { getPatientRepository } from '@/modules/patients/infrastructure/repository'
import { startOfDay } from '@/lib/utils/date'

export const metadata: Metadata = {
  title: 'Coletar resposta',
  description: 'Preenchimento de formulário digital da clínica.',
}

export default async function FormResponsePage({
  params,
}: {
  params: Promise<{ formId: string }>
}) {
  await connection()
  const { formId } = await params
  if (!z.uuid().safeParse(formId).success) notFound()

  const [formSource, role] = await Promise.all([
    getFormRepository(),
    getActiveClinicRole(),
  ])

  if (formSource.isLive && !can(role, 'patient.write')) forbidden()

  const form = await formSource.repository.findById(formSource.clinicId, formId)
  if (!form || form.status !== 'published') notFound()

  const patientSource = await getPatientRepository(startOfDay(new Date()))
  const patientPage = await patientSource.repository.listPage(patientSource.clinicId, {
    search: null,
    status: 'active',
    limit: 50,
    cursor: null,
  })

  return (
    <FormResponseScreen
      form={toFormDto(form)}
      patients={patientPage.items.map((patient) => ({ id: patient.id, name: patient.name }))}
      onSave={saveFormResponseFromScreen}
      isLive={formSource.isLive && patientSource.isLive}
    />
  )
}
