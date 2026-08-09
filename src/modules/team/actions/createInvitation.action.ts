'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { getApplicationOrigin } from '@/lib/urls/applicationOrigin'
import { createAction } from '@/modules/_shared/application/createAction'
import { err, ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toTeamFailure } from '../application/teamFailure'
import { teamRepositoryFor } from '../infrastructure/repository'
import {
  createInvitationSchema,
  teamMessages,
  type CreatedInvitationDto,
  type CreateInvitationInput,
} from '../schemas/team.schema'

const runCreateInvitation = createAction<
  CreateInvitationInput,
  CreatedInvitationDto
>({
  name: 'team.createInvitation',
  schema: createInvitationSchema,
  roles: rolesWith('team.manage'),
  messages: {
    forbidden: teamMessages.forbidden,
    validation: teamMessages.invalidFields,
    unavailable: teamMessages.unavailable,
    unexpected: teamMessages.unexpected,
  },
  revalidatePaths: ['/equipe'],

  handler: async (input, context) => {
    /*
     * Ninguem convida para um papel que nao tem.
     *
     * Mesma escalada que `changeRole` fecha, por outra porta: `admin` tem
     * `team.manage` e nao tem `record.read`. Sem esta recusa, ele convida um
     * `owner` para um endereco que controla, aceita em outra sessao e le o
     * prontuario de todos — o controle de LGPD da matriz de permissoes
     * contornado por quem ele restringe.
     *
     * A RPC `create_invitation` tambem precisa da regra, e ela JA ESTA
     * APLICADA no banco: `20260809_invitation_role_guard.sql` a substitui. Ate
     * ser aplicada, esta linha e a unica barreira — e ela ja basta, porque
     * toda emissao passa por aqui.
     */
    if (input.role === 'owner' && context.role !== 'owner') {
      return err('forbidden', teamMessages.roleEscalation)
    }

    const origin = await getApplicationOrigin()
    if (!origin) return err('unavailable', teamMessages.inviteUnavailable)

    const repository = teamRepositoryFor(context.supabase)

    try {
      const invitation = await repository.createInvitation(
        context.clinicId,
        input.email,
        input.role,
      )

      return ok<CreatedInvitationDto>({
        email: input.email,
        role: input.role,
        expiresAt: invitation.expiresAt.toISOString(),
        inviteUrl: new URL(
          `/convite/${encodeURIComponent(invitation.token)}`,
          origin,
        ).toString(),
      })
    } catch (cause) {
      return toTeamFailure('team.createInvitation', cause)
    }
  },

  // O token, o e-mail e o link não entram na auditoria. O evento registra
  // somente que uma emissão ocorreu e qual papel foi concedido.
  audit: (_output, input) => ({
    action: 'invitation.created',
    entityType: 'invitation',
    entityId: null,
    after: { role: input.role },
  }),
})

export async function createInvitationAction(
  rawInput: unknown,
): Promise<ActionResult<CreatedInvitationDto>> {
  return runCreateInvitation(rawInput)
}
