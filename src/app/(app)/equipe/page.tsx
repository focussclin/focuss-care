import type { Metadata } from 'next'
import { forbidden } from 'next/navigation'
import { connection } from 'next/server'

import { getActiveClinicRole } from '@/lib/auth/active-clinic'
import { can } from '@/lib/auth/permissions'
import { getSessionState } from '@/lib/auth/session'
import {
  toPendingInvitationDto,
  toTeamMemberDto,
} from '@/modules/team/application/toTeamDto'
import { getTeamRepository } from '@/modules/team/infrastructure/repository'
import { EquipeScreen } from '@/modules/team/ui/EquipeScreen'

export const metadata: Metadata = {
  title: 'Equipe',
  description: 'Gerencie os profissionais e as permissões de acesso.',
}

/**
 * Equipe — feature **S-01**.
 *
 * `cacheComponents` (F-02) exige shell estático; esta rota lê sessão em cookie
 * antes de decidir se renderiza. `instant = false` é a saída documentada, a
 * mesma já adotada na casca de `(app)` (pendência P-C2).
 */
export const instant = false

/** Quantas ausências a tela carrega. Histórico completo é relatório, não tela. */
const TIME_OFF_LIMIT = 50

export default async function EquipePage() {
  await connection()

  /*
   * Autorização ANTES da leitura.
   *
   * A lista de equipe expõe nome, e-mail e papel de todo mundo da clínica —
   * dado pessoal de terceiros. `forbidden()` interrompe o render e mostra
   * `app/forbidden.tsx` (I-05), em vez de entregar uma tela vazia que sugeriria
   * que a clínica não tem equipe.
   */
  const role = await getActiveClinicRole()
  if (!can(role, 'team.read')) forbidden()

  const [teamSource, session] = await Promise.all([
    getTeamRepository(),
    getSessionState(),
  ])

  const [members, invitations, employees, timeOff] = await Promise.all([
    teamSource.repository.listMembers(teamSource.clinicId),
    teamSource.repository.listPendingInvitations(teamSource.clinicId),
    teamSource.repository.listEmployees(teamSource.clinicId),
    teamSource.repository.listTimeOff(teamSource.clinicId, TIME_OFF_LIMIT),
  ])

  return (
    <EquipeScreen
      members={members.map(toTeamMemberDto)}
      invitations={invitations.map(toPendingInvitationDto)}
      // A tela usa isto só para NÃO oferecer auto-revogação. A recusa de
      // verdade é do adapter, no servidor — esconder o botão é cortesia, não
      // controle de acesso.
      currentUserId={session.status === 'active' ? session.user.id : null}
      canManage={can(role, 'team.manage')}
      employees={employees.map((employee) => ({
        id: employee.id,
        fullName: employee.fullName,
        roleTitle: employee.roleTitle,
        contractType: employee.contractType,
        isActive: employee.isActive,
      }))}
      /*
       * `reason` NÃO é mapeado: em atestado e licença ele costuma dizer a
       * condição de saúde da pessoa, e esta tela é de administração.
       */
      timeOff={timeOff.map((entry) => ({
        id: entry.id,
        employeeName: entry.employeeName,
        kind: entry.kind,
        status: entry.status,
        startsOn: entry.startsOn.toISOString(),
        endsOn: entry.endsOn.toISOString(),
        answeredAt: entry.answeredAt?.toISOString() ?? null,
      }))}
      isLive={teamSource.isLive}
    />
  )
}
