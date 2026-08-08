import type { Metadata } from 'next'
import { connection } from 'next/server'

import { startOfDay } from '@/lib/utils/date'
import {
  toEncounterDto,
  toQueueEntryDto,
} from '@/modules/encounters/application/toEncounterDto'
import { getEncounterRepository } from '@/modules/encounters/infrastructure/repository'
import { AtendimentosScreen } from '@/modules/encounters/ui/AtendimentosScreen'
import { getPatientRepository } from '@/modules/patients/infrastructure/repository'
import { PATIENT_PAGE_MAX_SIZE } from '@/modules/patients/schemas/patientQuery.schema'
import { getAppointmentRepository } from '@/modules/scheduling/infrastructure/repository'

export const metadata: Metadata = {
  title: 'Atendimentos',
  description: 'Acompanhe a fila e o andamento dos atendimentos da clínica.',
}

/**
 * Fila e atendimentos do dia — feature **E-01**.
 *
 * Substitui a tela de vitrine que vivia em `OperationsScreens.tsx`.
 *
 * **A composição dos três módulos acontece AQUI, na rota, e não dentro do
 * módulo de atendimento.** A tela precisa de pacientes (para o check-in de
 * encaixe) e de profissionais (para saber quem atende), e os dois moram em
 * outros módulos. Um módulo importando o interior de outro é a regra 4 da
 * arquitetura, verificada pelo lint desde F-03; a rota, que não é módulo, pode
 * juntar as peças — é o mesmo padrão que `/agenda` já usa.
 */
export default async function AtendimentosPage() {
  await connection()
  const today = startOfDay(new Date())

  const [encounterSource, patientSource, appointmentSource] = await Promise.all([
    getEncounterRepository(today),
    getPatientRepository(today),
    getAppointmentRepository(today),
  ])

  const [queue, encounters, metrics, patientPage, professionals] =
    await Promise.all([
      encounterSource.repository.listQueue(encounterSource.clinicId, today),
      encounterSource.repository.listEncounters(
        encounterSource.clinicId,
        today,
      ),
      encounterSource.repository.countMetrics(encounterSource.clinicId, today),
      /*
       * Primeira página, não a clínica inteira — o mesmo limite explícito que a
       * agenda declara desde P-02a. Clínica grande precisa de seletor com busca
       * server-side no check-in, e isso é trabalho de uma fatia própria.
       */
      patientSource.repository.listPage(patientSource.clinicId, {
        search: null,
        status: 'active',
        limit: PATIENT_PAGE_MAX_SIZE,
        cursor: null,
      }),
      appointmentSource.repository.listProfessionals(
        appointmentSource.clinicId,
      ),
    ])

  return (
    <AtendimentosScreen
      queue={queue.map(toQueueEntryDto)}
      openEncounters={encounters
        .filter((encounter) => encounter.status === 'open')
        .map(toEncounterDto)}
      closedEncounters={encounters
        .filter((encounter) => encounter.status === 'closed')
        .map(toEncounterDto)}
      metrics={metrics}
      patients={patientPage.items.map((patient) => ({
        id: patient.id,
        name: patient.name,
      }))}
      professionals={professionals.map((professional) => ({
        id: professional.id,
        name: professional.name,
      }))}
      isLive={encounterSource.isLive}
    />
  )
}
