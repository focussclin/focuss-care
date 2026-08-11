import type { Metadata } from 'next'
import { forbidden } from 'next/navigation'
import { connection } from 'next/server'

import { getActiveClinicRole } from '@/lib/auth/active-clinic'
import { can } from '@/lib/auth/permissions'
import { getSessionState } from '@/lib/auth/session'
import { toProfessionalDto } from '@/modules/team/application/toProfessionalDto'
import {
  toPendingInvitationDto,
  toTeamMemberDto,
} from '@/modules/team/application/toTeamDto'
import type { Professional } from '@/modules/team/domain/Professional'
import { isProfessionalError } from '@/modules/team/domain/ProfessionalRepository'
import { getProfessionalSource } from '@/modules/team/infrastructure/professional-repository'
import { getTeamRepository } from '@/modules/team/infrastructure/repository'
import { professionalMessages } from '@/modules/team/schemas/professional.schema'
import { EquipeScreen } from '@/modules/team/ui/EquipeScreen'

export const metadata: Metadata = {
  title: 'Equipe',
  description: 'Gerencie os profissionais e as permissões de acesso.',
}

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

  const [teamSource, professionalSource, session] = await Promise.all([
    getTeamRepository(),
    getProfessionalSource(),
    getSessionState(),
  ])

  const [members, invitations, employees, timeOff] = await Promise.all([
    teamSource.repository.listMembers(teamSource.clinicId),
    teamSource.repository.listPendingInvitations(teamSource.clinicId),
    teamSource.repository.listEmployees(teamSource.clinicId),
    teamSource.repository.listTimeOff(teamSource.clinicId, TIME_OFF_LIMIT),
  ])

  /*
   * Os profissionais têm leitura própria, e falha própria.
   *
   * Se `professionals` não carregar, o resto da tela continua servindo: quem
   * veio revogar um acesso não deveria ficar sem a lista de membros por causa
   * de uma policy do cadastro de quem atende.
   */
  let professionals: Professional[] = []
  let professionalsError: string | null = null

  try {
    professionals = await professionalSource.repository.list(professionalSource.clinicId)
  } catch (cause) {
    if (!isProfessionalError(cause)) throw cause
    professionalsError =
      cause.reason === 'forbidden'
        ? professionalMessages.forbidden
        : professionalMessages.unavailable
  }

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
        // Dia de calendário como string: `Date` não atravessa a fronteira para
        // o Client Component sem virar texto em algum ponto.
        hireDate: employee.hireDate ? toIsoDay(employee.hireDate) : null,
        terminationDate: employee.terminationDate
          ? toIsoDay(employee.terminationDate)
          : null,
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
      professionals={professionals.map(toProfessionalDto)}
      professionalsError={professionalsError}
      isLive={teamSource.isLive}
    />
  )
}

/** 'YYYY-MM-DD' no fuso local — a data é dia de calendário, não instante. */
function toIsoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${date.getFullYear()}-${month}-${day}`
}
