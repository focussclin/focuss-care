import type { Metadata } from 'next'
import { ArrowLeft, CalendarX2 } from 'lucide-react'
import Link from 'next/link'
import { forbidden, notFound } from 'next/navigation'
import { connection } from 'next/server'
import { z } from 'zod'

import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusBadge } from '@/components/ui/status-badge'
import { getActiveClinicRole } from '@/lib/auth/active-clinic'
import { can } from '@/lib/auth/permissions'
import { formatShortDate, formatTime, startOfDay } from '@/lib/utils/date'
import { appointmentStatusMeta } from '@/modules/_shared/domain/types'
import { getPatientRepository } from '@/modules/patients/infrastructure/repository'
import { getAppointmentRepository } from '@/modules/scheduling/infrastructure/repository'

export const metadata: Metadata = {
  title: 'Histórico do paciente',
}

export default async function PatientHistoryPage({
  params,
}: PageProps<'/pacientes/[patientId]/historico'>) {
  await connection()
  const today = startOfDay(new Date())

  const { patientId } = await params
  if (!z.uuid().safeParse(patientId).success) notFound()

  const [patientSource, appointmentSource, role] = await Promise.all([
    getPatientRepository(today),
    getAppointmentRepository(today),
    getActiveClinicRole(),
  ])

  /*
   * Esta rota INTEIRA e a agenda de uma pessoa, entao ela e bloqueada por
   * completo — diferente de `/pacientes/[patientId]`, onde a agenda e uma secao
   * dentro de uma ficha que `finance` precisa abrir para faturar.
   *
   * Quem chega aqui sem `appointment.read` esta pedindo exatamente o que a
   * matriz nega: a lista de com quem, quando e de que tipo aquela pessoa
   * consultou. Devolver a pagina vazia seria pior que negar — diria "esta
   * paciente nunca veio".
   */
  if (
    appointmentSource.isLive &&
    !(can(role, 'patient.read') && can(role, 'appointment.read'))
  ) {
    forbidden()
  }

  const patient = await patientSource.repository.findById(
    patientSource.clinicId,
    patientId,
  )

  if (!patient) notFound()

  const appointments = await appointmentSource.repository.listByPatient(
    appointmentSource.clinicId,
    patient.id,
  )

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/pacientes/${patient.id}`}
        className="inline-flex w-fit items-center gap-1.5 text-aux font-medium text-link hover:underline"
      >
        <ArrowLeft aria-hidden className="size-4" />
        {patient.name}
      </Link>

      <PageHeader
        eyebrow="Histórico completo"
        title="Atendimentos"
        description={`Todos os atendimentos registrados de ${patient.name}.`}
      />

      <Card className="overflow-hidden">
        {appointments.length === 0 ? (
          <EmptyState
            icon={CalendarX2}
            title="Ainda não há atendimentos registrados."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border-card">
            {appointments.map((appointment) => {
              const status = appointmentStatusMeta[appointment.status]

              return (
                <li
                  key={appointment.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4"
                >
                  <span className="w-32 shrink-0 text-aux text-muted tabular-nums">
                    {formatShortDate(appointment.startsAt)} ·{' '}
                    {formatTime(appointment.startsAt)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-aux font-medium text-foreground">
                      {appointment.type}
                    </span>
                    <span className="block truncate text-label text-muted">
                      {appointment.professionalName}
                    </span>
                  </span>
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                </li>
              )
            })}
          </ul>
        )}
      </Card>
    </div>
  )
}
