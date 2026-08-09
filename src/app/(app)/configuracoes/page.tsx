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

  return (
    <ConfiguracoesScreen
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
