import type { Metadata } from 'next'
import { connection } from 'next/server'

import { addDays, startOfDay, startOfWeek } from '@/lib/utils/date'
import { getPatientRepository } from '@/modules/patients/infrastructure/repository'
import { PICKER_RESULT_LIMIT } from '@/modules/patients/schemas/patientPicker.schema'
import { PatientPicker } from '@/modules/patients/ui/PatientPicker'
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
     * Estado INICIAL do seletor de paciente — nao a base para filtrar.
     *
     * Ate P-02a esta consulta trazia a clinica inteira; depois dela, as 50
     * primeiras em ordem alfabetica, que o `datalist` filtrava no navegador. As
     * duas versoes tinham o mesmo defeito: quem nao estivesse no pedaco
     * carregado simplesmente nao existia para a agenda.
     *
     * Agora quem procura vai ao servidor (`patient.search`), e estes oito servem
     * so ao campo vazio — abrir o modal e ver uma lista em branco nao ajuda
     * ninguem. `status: 'active'` acompanha a busca: nao se marca consulta para
     * paciente arquivado.
     */
    patientSource.repository.listPage(patientSource.clinicId, {
      search: null,
      status: 'active',
      limit: PICKER_RESULT_LIMIT,
      cursor: null,
    }),
  ])

  /*
   * O seletor de paciente e montado AQUI, e nao dentro da agenda.
   *
   * `PatientPicker` pertence ao modulo `patients` e a agenda nao alcanca o
   * interior dele (regra 4 da arquitetura). A tela declara um buraco com forma
   * conhecida — `renderPatientField` — e a rota o preenche. Mesmo padrao do
   * seletor de clinica e do cartao de perfil.
   */
  const patientOptions = patientPage.items.map((patient) => ({
    id: patient.id,
    name: patient.name,
  }))

  return (
    <AgendaScreen
      today={today}
      initialAppointments={appointments}
      patients={patientPage.items}
      professionals={professionals}
      openNewOnMount={novo === '1'}
      defaultDurationMinutes={defaultDurationMinutes}
      isLive={appointmentSource.isLive}
      renderPatientField={(control) => (
        <PatientPicker
          initialOptions={patientOptions}
          value={control.value}
          onChange={control.onChange}
          error={control.error}
          isLive={patientSource.isLive}
        />
      )}
    />
  )
}
