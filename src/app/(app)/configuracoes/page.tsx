import type { Metadata } from 'next'
import { connection } from 'next/server'

import { getActiveClinicRole } from '@/lib/auth/active-clinic'
import { can } from '@/lib/auth/permissions'
import { toClinicSettingsDto } from '@/modules/settings/application/toSettingsDto'
import { getClinicSettingsRepository } from '@/modules/settings/infrastructure/repository'
import { ConfiguracoesScreen } from '@/modules/settings/ui/ConfiguracoesScreen'

export const metadata: Metadata = {
  title: 'Configurações',
  description: 'Ajuste as preferências e os dados da sua clínica.',
}

/**
 * Configurações — feature **C-01**.
 *
 * `cacheComponents` (F-02) exige shell estático; esta rota lê sessão em cookie
 * antes de decidir o que renderizar. `instant = false` é a saída documentada, a
 * mesma já adotada na casca de `(app)` (pendência P-C2).
 */
export const instant = false

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

  const source = await getClinicSettingsRepository()
  const settings = await source.repository.load(source.clinicId)

  return (
    <ConfiguracoesScreen
      settings={toClinicSettingsDto(settings)}
      canManage={can(role, 'clinic.settings')}
      isLive={source.isLive}
    />
  )
}
