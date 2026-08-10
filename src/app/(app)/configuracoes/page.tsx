import type { Metadata } from 'next'
import { connection } from 'next/server'

import { getActiveClinicRole } from '@/lib/auth/active-clinic'
import { getSessionState } from '@/lib/auth/session'
import { can } from '@/lib/auth/permissions'
import { getProfileRepository } from '@/modules/identity/infrastructure/repository'
import { getIntegrationCredentialRepository } from '@/modules/integrations/infrastructure/credentials-repository'
import { PersonalProfileForm } from '@/modules/identity/ui/PersonalProfileForm'
import { toClinicSettingsDto } from '@/modules/settings/application/toSettingsDto'
import { getClinicSettingsRepository } from '@/modules/settings/infrastructure/repository'
import {
  createAvailabilityExceptionFromPanel,
  removeAvailabilityExceptionFromPanel,
} from '@/modules/scheduling/actions/availabilityPanel.actions'
import type { AvailabilityException } from '@/modules/scheduling/domain/AvailabilityException'
import { isAvailabilityExceptionError } from '@/modules/scheduling/domain/AvailabilityExceptionRepository'
import { getAvailabilityExceptionSource } from '@/modules/scheduling/infrastructure/availability-repository'
import { getAppointmentRepository } from '@/modules/scheduling/infrastructure/repository'
import { availabilityMessages } from '@/modules/scheduling/schemas/availabilityException.schema'
import { AvailabilityExceptionsPanel } from '@/modules/scheduling/ui/AvailabilityExceptionsPanel'
import { ConfiguracoesScreen } from '@/modules/settings/ui/ConfiguracoesScreen'

export const metadata: Metadata = {
  title: 'Configurações',
  description: 'Ajuste as preferências e os dados da sua clínica.',
}

export default async function ConfiguracoesPage() {
  await connection()

  /*
   * Sem `forbidden()` aqui, ao contrário de `/equipe` e `/prontuarios`.
   *
   * A diferença é o que a tela expõe. A lista de equipe traz nome e e-mail de
   * terceiros; o prontuário traz dado de saúde. Aqui não há nada além do
   * cadastro da própria empresa e do horário em que ela abre — informação que a
   * recepção lê no carimbo e o profissional lê no receituário.
   *
   * Quem não tem `clinic.settings` vê tudo, sem os formulários. A recusa de
   * verdade continua no servidor: as três actions exigem o papel.
   */
  const role = await getActiveClinicRole()

  const [source, credentialSource, session, profileRepository] = await Promise.all([
    getClinicSettingsRepository(),
    getIntegrationCredentialRepository(),
    getSessionState(),
    getProfileRepository(),
  ])

  const settings = await source.repository.load(source.clinicId)
  const integrationCredentials = await credentialSource.repository.overview(
    credentialSource.clinicId,
  )

  /*
   * Composição entre módulos na ROTA (regra 4): `settings` não alcança o
   * interior de `identity`, e vice-versa. O card chega à tela como slot.
   *
   * A leitura é defensiva: perfil é o card menos importante desta página, e
   * derrubar as configurações da clínica porque ele não carregou trocaria um
   * problema pequeno por um grande. Sem Supabase configurado o repositório é
   * nulo — e um perfil de demonstração editável seria pior que nenhum.
   */
  const profile =
    session.status === 'active' && profileRepository
      ? await profileRepository.findById(session.user.id).catch((cause) => {
          console.error('[configuracoes] perfil indisponivel', {
            kind: cause instanceof Error ? cause.name : typeof cause,
          })
          return null
        })
      : null

  /*
   * Bloqueios de agenda — leitura para todos, escrita para `appointment.write`.
   *
   * Ver quando a clínica estará fechada não expõe dado de ninguém: é a mesma
   * natureza do horário de funcionamento acima. Criar e remover, sim, mudam a
   * agenda de todo mundo.
   */
  const availabilitySource = await getAvailabilityExceptionSource()
  const canManageAvailability = can(role, 'appointment.write')

  let exceptions: AvailabilityException[] = []
  let availabilityError: string | null = null

  try {
    exceptions = await availabilitySource.repository.listUpcoming(
      availabilitySource.clinicId,
      new Date(),
    )
  } catch (cause) {
    if (!isAvailabilityExceptionError(cause)) throw cause
    availabilityError =
      cause.reason === 'forbidden'
        ? availabilityMessages.forbidden
        : availabilityMessages.unavailable
  }

  /*
   * A lista de profissionais vem do repositório da agenda, que já a expõe para
   * o formulário de agendamento — nenhuma consulta nova para o mesmo dado.
   */
  const appointmentSource = await getAppointmentRepository(new Date())
  const professionals = availabilitySource.isLive
    ? await appointmentSource.repository
        .listProfessionals(appointmentSource.clinicId)
        .catch(() => [])
    : []

  return (
    <ConfiguracoesScreen
      availabilitySlot={
        <AvailabilityExceptionsPanel
          exceptions={exceptions.map((exception) => ({
            id: exception.id,
            professionalId: exception.professionalId,
            professionalName: exception.professionalName,
            kind: exception.kind,
            startsAt: exception.startsAt.toISOString(),
            endsAt: exception.endsAt.toISOString(),
            reason: exception.reason,
          }))}
          professionals={professionals.map((professional) => ({
            id: professional.id,
            name: professional.name,
          }))}
          onCreate={createAvailabilityExceptionFromPanel}
          onRemove={removeAvailabilityExceptionFromPanel}
          canManage={canManageAvailability}
          isLive={availabilitySource.isLive}
          loadError={availabilityError}
        />
      }
      settings={toClinicSettingsDto(settings)}
      canManage={can(role, 'clinic.settings')}
      profileSlot={
        profile ? (
          <PersonalProfileForm
            profile={{
              fullName: profile.fullName,
              email: profile.email,
              phone: profile.phone,
            }}
          />
        ) : null
      }
      isLive={source.isLive}
      integrationCredentials={integrationCredentials}
    />
  )
}
