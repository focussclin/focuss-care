import type { Metadata } from 'next'
import { connection } from 'next/server'

import { patientMetrics } from '@/lib/mocks/clinic-data'
import { startOfDay } from '@/lib/utils/date'
import { getPatientRepository } from '@/modules/patients/infrastructure/repository'
import { PatientsScreen } from '@/modules/patients/ui/PatientsScreen'

export const metadata: Metadata = {
  title: 'Pacientes',
  description: 'Acompanhe os pacientes e seus próximos cuidados.',
}

export default async function PacientesPage({
  searchParams,
}: PageProps<'/pacientes'>) {
  await connection()
  const today = startOfDay(new Date())

  const { novo } = await searchParams
  const { repository, clinicId, isLive } = await getPatientRepository(today)
  const patients = await repository.listByClinic(clinicId)

  /*
   * Os numeros do resumo vem do handoff enquanto nao ha banco. Com Supabase ativo,
   * o total real e derivado da consulta; "novos no mes" e "pendentes" viram
   * agregacoes proprias quando o modulo financeiro/agenda for ligado.
   */
  const metrics = isLive
    ? {
        total: patients.length,
        newThisMonth: patients.filter(
          (patient) =>
            patient.createdAt.getMonth() === today.getMonth() &&
            patient.createdAt.getFullYear() === today.getFullYear(),
        ).length,
        pendingAppointments: patients.filter(
          (patient) => patient.nextVisitAt !== null,
        ).length,
      }
    : patientMetrics

  return (
    <PatientsScreen
      today={today}
      initialPatients={patients}
      metrics={metrics}
      openNewOnMount={novo === '1'}
    />
  )
}
