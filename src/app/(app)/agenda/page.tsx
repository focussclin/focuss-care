import type { Metadata } from 'next'
import { connection } from 'next/server'

import { addDays, startOfDay, startOfWeek } from '@/lib/utils/date'
import { getPatientRepository } from '@/modules/patients/infrastructure/repository'
import { getAppointmentRepository } from '@/modules/scheduling/infrastructure/repository'
import { AgendaScreen } from '@/modules/scheduling/ui/AgendaScreen'

export const metadata: Metadata = {
  title: 'Agenda',
  description: 'Organize os atendimentos da sua clínica.',
}

/**
 * Janela pre-carregada em torno de hoje. A navegacao entre semanas e client-side,
 * entao carregamos um intervalo maior que a semana atual para que voltar ou avancar
 * nao fique sem dados. Ao ligar o banco em producao, isto vira refetch por intervalo.
 */
const WEEKS_BEFORE = 2
const WEEKS_AFTER = 4

export default async function AgendaPage({
  searchParams,
}: PageProps<'/agenda'>) {
  await connection()
  const today = startOfDay(new Date())

  const { novo } = await searchParams

  const rangeStart = addDays(startOfWeek(today), -7 * WEEKS_BEFORE)
  const rangeEnd = addDays(startOfWeek(today), 7 * WEEKS_AFTER)

  const [appointmentSource, patientSource] = await Promise.all([
    getAppointmentRepository(today),
    getPatientRepository(today),
  ])

  const [appointments, professionals, patients] = await Promise.all([
    appointmentSource.repository.listByRange(
      appointmentSource.clinicId,
      rangeStart,
      rangeEnd,
    ),
    appointmentSource.repository.listProfessionals(appointmentSource.clinicId),
    patientSource.repository.listByClinic(patientSource.clinicId),
  ])

  return (
    <AgendaScreen
      today={today}
      initialAppointments={appointments}
      patients={patients}
      professionals={professionals}
      openNewOnMount={novo === '1'}
    />
  )
}
