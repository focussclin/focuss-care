import type { PendingInvitation, TeamMember } from '../domain/TeamMember'
import type {
  PendingInvitationDto,
  TeamMemberDto,
} from '../schemas/team.schema'

/**
 * Entidade -> o que atravessa a fronteira da Server Action.
 *
 * `professional.id` NÃO viaja: a tela mostra especialidade, não o id do
 * cadastro profissional, e um id que a interface não usa é superfície de graça.
 */
export function toTeamMemberDto(member: TeamMember): TeamMemberDto {
  return {
    id: member.id,
    userId: member.userId,
    name: member.name,
    email: member.email,
    role: member.role,
    status: member.status,
    specialties: member.professional?.specialties ?? [],
    acceptedAt: member.acceptedAt?.toISOString() ?? null,
  }
}

export function toPendingInvitationDto(
  invitation: PendingInvitation,
): PendingInvitationDto {
  return {
    id: invitation.id,
    email: invitation.email,
    role: invitation.role,
    expiresAt: invitation.expiresAt.toISOString(),
  }
}
