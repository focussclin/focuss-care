import type { Metadata } from 'next'
import { forbidden } from 'next/navigation'
import { connection } from 'next/server'

import { getActiveClinicRole } from '@/lib/auth/active-clinic'
import { can } from '@/lib/auth/permissions'
import { addDays, startOfDay, startOfWeek } from '@/lib/utils/date'
import { getPatientRepository } from '@/modules/patients/infrastructure/repository'
import { PICKER_RESULT_LIMIT } from '@/modules/patients/schemas/patientPicker.schema'
import { getAppointmentRepository } from '@/modules/scheduling/infrastructure/repository'
import { getClinicSettingsRepository } from '@/modules/settings/infrastructure/repository'
import { getCachedDefaultDuration } from '@/modules/settings/infrastructure/settingsCache'

import { AgendaWorkspace } from './AgendaWorkspace'

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

  const [appointmentSource, patientSource, settingsSource, role] =
    await Promise.all([
      getAppointmentRepository(today),
      getPatientRepository(today),
      getClinicSettingsRepository(),
      getActiveClinicRole(),
    ])

  /*
   * `appointment.read` nao era exigido em rota NENHUMA do produto.
   *
   * O menu esconde "Agenda" de quem nao tem a permissao, e isso bastava para
   * ninguem notar — mas menu nao e fronteira: a URL continua digitavel, e o
   * prefetch de um link vizinho nem depende de alguem digitar.
   *
   * `finance` e o unico papel sem `appointment.read`, e a matriz de
   * `lib/auth/permissions.ts` diz por que, com todas as letras: "o que ele nao
   * alcanca e agenda, atendimento e prontuario". A intencao estava escrita; a
   * checagem e que faltava. Sem esta linha, um financeiro convidado so para
   * faturar lia a semana inteira da clinica — quem consulta com quem, quando e
   * de que tipo, que e dado de saude por inferencia mesmo sem nenhum diagnostico
   * junto.
   *
   * `isLive` guarda o modo de demonstracao, onde nao ha vinculo nem papel para
   * consultar e o repositorio nem fala com o banco — mesmo padrao de
   * `/estoque`, `/documentos` e `/inbox`.
   */
  if (appointmentSource.isLive && !can(role, 'appointment.read')) forbidden()

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
   * O seletor de paciente e montado por `AgendaWorkspace`, e nao aqui.
   *
   * `PatientPicker` pertence ao modulo `patients` e a agenda nao alcanca o
   * interior dele (regra 4 da arquitetura), entao a composicao fica fora dos
   * dois modulos. O que ela NAO pode ser e uma funcao criada nesta rota: daqui
   * so atravessa o que serializa, e funcao nao serializa. O porque completo
   * esta no JSDoc de `AgendaWorkspace`.
   */
  const patientOptions = patientPage.items.map((patient) => ({
    id: patient.id,
    name: patient.name,
  }))

  return (
    <AgendaWorkspace
      today={today}
      initialAppointments={appointments}
      patients={patientPage.items}
      professionals={professionals}
      openNewOnMount={novo === '1'}
      defaultDurationMinutes={defaultDurationMinutes}
      isLive={appointmentSource.isLive}
      patientOptions={patientOptions}
      patientSearchIsLive={patientSource.isLive}
    />
  )
}
