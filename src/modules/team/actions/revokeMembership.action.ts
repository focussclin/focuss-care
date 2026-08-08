'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toTeamFailure } from '../application/teamFailure'
import { toTeamMemberDto } from '../application/toTeamDto'
import { teamRepositoryFor } from '../infrastructure/repository'
import {
  revokeMembershipSchema,
  teamMessages,
  type RevokeMembershipInput,
  type TeamMemberDto,
} from '../schemas/team.schema'

/**
 * Revoga o acesso de um membro — feature **S-01**.
 *
 * # Revogar não apaga
 *
 * O vínculo continua na base com `status = 'revoked'` e a data. Quem teve
 * acesso a dado de saúde, e entre que datas, é exatamente o tipo de pergunta
 * que uma clínica precisa conseguir responder — apagar a linha destruiria a
 * resposta. É a mesma regra do cancelamento na agenda e do prontuário
 * append-only.
 *
 * O adapter impõe duas recusas, e as duas evitam deixar a clínica inoperante:
 * ninguém revoga a si mesmo, e o último `owner` ativo não é revogável.
 *
 * # O que esta action NÃO faz
 *
 * **Não encerra a sessão ativa da pessoa.** Revogar marca o vínculo; o JWT em
 * uso continua válido até expirar, e enquanto isso a RLS já recusa as leituras
 * porque `current_clinic_id()` deixa de resolver para esta clínica. O efeito
 * prático é acesso negado, não uma sessão derrubada na hora — e derrubá-la de
 * verdade exige invalidar o refresh token pela API de admin, que este ambiente
 * não pode alcançar (`SUPABASE_SECRET_KEY` só em job/webhook, P2 da
 * arquitetura).
 */
const runRevokeMembership = createAction<RevokeMembershipInput, TeamMemberDto>({
  name: 'team.revoke',
  schema: revokeMembershipSchema,
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
      const member = await repository.revoke(
        context.clinicId,
        input.membershipId,
        context.userId,
      )

      return ok<TeamMemberDto>(toTeamMemberDto(member))
    } catch (cause) {
      return toTeamFailure('team.revoke', cause)
    }
  },

  /**
   * Nome e e-mail ficam de fora do evento: são dado pessoal e vivem em
   * `profiles`, alcançável por `user_id`. O evento registra QUE o acesso foi
   * revogado e DE QUEM, não quem a pessoa é.
   */
  audit: (output) => ({
    action: 'membership.revoked',
    entityType: 'membership',
    entityId: output.id,
    after: { status: output.status, user_id: output.userId },
  }),
})

export async function revokeMembershipAction(
  rawInput: unknown,
): Promise<ActionResult<TeamMemberDto>> {
  return runRevokeMembership(rawInput)
}
