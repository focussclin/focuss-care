import type { Metadata } from 'next'
import { connection } from 'next/server'

import { addDays, startOfDay, startOfWeek } from '@/lib/utils/date'
import { getPatientRepository } from '@/modules/patients/infrastructure/repository'
import { PATIENT_PAGE_MAX_SIZE } from '@/modules/patients/schemas/patientQuery.schema'
import { getAppointmentRepository } from '@/modules/scheduling/infrastructure/repository'
import { AgendaScreen } from '@/modules/scheduling/ui/AgendaScreen'
import { getClinicSettingsRepository } from '@/modules/settings/infrastructure/repository'
import { getCachedDefaultDuration } from '@/modules/settings/infrastructure/settingsCache'

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

  const [appointmentSource, patientSource, settingsSource] = await Promise.all([
    getAppointmentRepository(today),
    getPatientRepository(today),
    getClinicSettingsRepository(),
  ])

  /*
   * Composicao entre modulos acontece na ROTA (regra 4 da arquitetura): a agenda
   * nao alcanca o interior de `settings`, e vice-versa.
   *
   * Esta e a UNICA leitura cacheada do produto (divida D3), e usa
   * `use cache: private` — que nunca guarda no servidor. O porque de nenhuma
   * outra leitura poder entrar esta em `settingsCache.ts`.
   *
   * A leitura continua defensiva: duracao padrao e conveniencia, a agenda e o
   * trabalho. Derrubar a tela porque a preferencia nao carregou trocaria um
   * problema pequeno por um grande — o fallback de 30 minutos e o mesmo valor
   * que o formulario assumia antes de C-01 existir.
   */
  const defaultDurationMinutes = await getCachedDefaultDuration(
    settingsSource.clinicId,
  ).catch((cause) => {
    console.error('[agenda] preferencia de duracao indisponivel', {
      kind: cause instanceof Error ? cause.name : typeof cause,
    })
    return 30
  })

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
      defaultDurationMinutes={defaultDurationMinutes}
      isLive={appointmentSource.isLive}
    />
  )
}
