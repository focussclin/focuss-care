'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toTeamFailure } from '../application/teamFailure'
import { toTeamMemberDto } from '../application/toTeamDto'
import { teamRepositoryFor } from '../infrastructure/repository'
import {
  changeRoleSchema,
  teamMessages,
  type ChangeRoleInput,
  type TeamMemberDto,
} from '../schemas/team.schema'

/**
 * Troca o papel de um membro — feature **S-01**.
 *
 * Trocar papel muda o que a pessoa vê e pode fazer com dado de saúde: promover
 * alguém a `owner` dá acesso a prontuário, e rebaixar tira. Por isso a operação
 * exige `team.manage` (só `owner` e `admin`, pela matriz de I-05) e é auditada.
 *
 * O adapter recusa rebaixar o ÚLTIMO `owner` ativo. A checagem vive lá, e não
 * aqui, porque depende de uma contagem no banco — e é o banco que sabe quantos
 * donos a clínica tem neste instante.
 */
const runChangeRole = createAction<ChangeRoleInput, TeamMemberDto, 'role'>({
  name: 'team.changeRole',
  schema: changeRoleSchema,
  roles: rolesWith('team.manage'),
  messages: {
    forbidden: teamMessages.forbidden,
    validation: teamMessages.invalidFields,
    unavailable: teamMessages.unavailable,
    unexpected: teamMessages.unexpected,
  },
  revalidatePaths: ['/equipe'],

  handler: async (input, context) => {
    const repository = teamRepositoryFor(context.supabase)

    try {
      const member = await repository.changeRole(
        context.clinicId,
        input.membershipId,
        input.role,
      )

      return ok<TeamMemberDto>(toTeamMemberDto(member))
    } catch (cause) {
      return toTeamFailure<'role'>('team.changeRole', cause)
    }
  },

  /**
   * Mudança de papel é evento de segurança: registra o papel novo e a pessoa
   * afetada. **Nome e e-mail ficam de fora** — são dado pessoal e vivem em
   * `profiles`, alcançável por `user_id`. `audit_log` é append-only: o que
   * entra ali não sai mais, nem quando alguém pedir remoção pela LGPD.
   */
  audit: (output) => ({
    action: 'membership.role_changed',
    entityType: 'membership',
    entityId: output.id,
    after: { role: output.role, user_id: output.userId },
  }),
})

export async function changeRoleAction(
  rawInput: unknown,
): Promise<ActionResult<TeamMemberDto, 'role'>> {
  return runChangeRole(rawInput)
}
