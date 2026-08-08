import type { Metadata } from 'next'
import { connection } from 'next/server'

import { addDays, startOfDay, startOfWeek } from '@/lib/utils/date'
import { getPatientRepository } from '@/modules/patients/infrastructure/repository'
import { PATIENT_PAGE_MAX_SIZE } from '@/modules/patients/schemas/patientQuery.schema'
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

  const [appointments, professionals, patientPage] = await Promise.all([
    appointmentSource.repository.listByRange(
      appointmentSource.clinicId,
      rangeStart,
      rangeEnd,
    ),
    appointmentSource.repository.listProfessionals(appointmentSource.clinicId),
    /*
     * Seletor de paciente do modal — PRIMEIRA PAGINA, nao a clinica inteira.
     *
     * Ate P-02a este era o unico chamador que carregava a base completa em toda
     * renderizacao da agenda. O limite explicito e a troca honesta: a lista para
     * nos 50 primeiros em ordem alfabetica, e clinica grande precisa de um
     * seletor com busca server-side — que e trabalho de A-01, nao desta fatia.
     */
    patientSource.repository.listPage(patientSource.clinicId, {
      search: null,
      status: 'all',
      limit: PATIENT_PAGE_MAX_SIZE,
      cursor: null,
    }),
  ])

  return (
    <AgendaScreen
      today={today}
      initialAppointments={appointments}
      patients={patientPage.items}
      professionals={professionals}
      openNewOnMount={novo === '1'}
      isLive={appointmentSource.isLive}
    />
  )
}
