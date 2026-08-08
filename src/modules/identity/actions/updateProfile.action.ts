'use server'

import { createAction } from '@/modules/_shared/application/createAction'
import { err, ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { isProfileRepositoryError } from '../domain/ProfileRepositoryError'
import { profileRepositoryFor } from '../infrastructure/repository'
import {
  profileMessages,
  updateProfileSchema,
  type ProfileDto,
  type UpdateProfileInput,
} from '../schemas/profile.schema'

type Field = 'fullName' | 'phone'

/**
 * Atualiza o próprio perfil.
 *
 * # Por que esta action NÃO declara `roles`
 *
 * Todas as outras do produto declaram, e esta não — de propósito. `roles` existe
 * para dizer o que um PAPEL pode fazer com o dado da clínica. Aqui o dado é da
 * pessoa: não há papel que autorize alguém a ter nome, e um `finance` tem
 * exatamente o mesmo direito sobre o próprio cadastro que o `owner`.
 *
 * O que protege a operação é outra coisa, e é mais forte: o `userId` sai do
 * `ActionContext`, e o adapter filtra por ele. Não existe campo por onde mandar
 * o id de outra pessoa — e, se existisse, a RLS de `profiles` recusaria.
 *
 * O pipeline continua sendo o mesmo (P5): autenticar → clínica ativa → validar →
 * revalidar → auditar. A exigência de clínica ativa vem do `createAction` e é
 * aceitável aqui porque a tela vive dentro de `(app)`, que já a exige.
 */
const runUpdateProfile = createAction<UpdateProfileInput, ProfileDto, Field>({
  name: 'profile.update',
  schema: updateProfileSchema,
  messages: {
    validation: profileMessages.invalidFields,
    unavailable: profileMessages.unavailable,
    unexpected: profileMessages.unexpected,
  },
  /*
   * Revalida o LAYOUT, e não a página raiz.
   *
   * `revalidatePath('/')` sozinho invalida apenas `/` — a casca compartilhada
   * por `/agenda`, `/pacientes` e todas as outras continuaria servindo o nome
   * antigo do Client Cache. O nome aparece no topo da tela e no menu lateral,
   * que são do layout: sem o `type`, a pessoa salvaria o nome novo e continuaria
   * vendo o antigo no canto — o que parece exatamente com não ter salvo.
   *
   * `{ path: '/', type: 'layout' }` purga o Client Cache inteiro. É pesado, e é
   * o alcance certo: o dado mudado aparece em toda rota autenticada.
   */
  revalidatePaths: [{ path: '/', type: 'layout' }],

  handler: async (input, context) => {
    const repository = profileRepositoryFor(context.supabase)

    try {
      const profile = await repository.update(context.userId, {
        fullName: input.fullName,
        phone: input.phone,
      })

      return ok<ProfileDto>({
        fullName: profile.fullName,
        email: profile.email,
        phone: profile.phone,
      })
    } catch (cause) {
      if (isProfileRepositoryError(cause)) {
        console.error('[profile.update] escrita recusada', {
          reason: cause.reason,
          code: cause.code,
        })

        switch (cause.reason) {
          case 'not-found':
            return err<Field>('not-found', profileMessages.notFound)
          case 'forbidden':
            return err<Field>('forbidden', profileMessages.forbidden)
          case 'unavailable':
            return err<Field>('unavailable', profileMessages.unavailable)
          case 'unexpected':
            return err<Field>('unexpected', profileMessages.unexpected)
        }
      }

      console.error('[profile.update] falha nao tratada', {
        kind: cause instanceof Error ? cause.name : typeof cause,
      })

      return err<Field>('unexpected', profileMessages.unexpected)
    }
  },

  /**
   * **Nome e telefone NÃO entram no log.**
   *
   * São dado pessoal, e `audit_log` é legível pela operação inteira e
   * append-only — o que entra ali não sai mais, nem quando alguém pedir remoção
   * pela LGPD. O evento registra que o perfil mudou e se passou a ter telefone;
   * os valores continuam em `profiles`, onde a RLS os protege.
   *
   * `entityId` fica nulo: o ator já é o dono da linha, e `recordAuditEvent`
   * grava `actor_user_id` a partir da sessão.
   */
  audit: (output) => ({
    action: 'profile.updated',
    entityType: 'profile',
    entityId: null,
    after: { has_phone: output.phone !== null },
  }),
})

export async function updateProfileAction(
  rawInput: unknown,
): Promise<ActionResult<ProfileDto, Field>> {
  return runUpdateProfile(rawInput)
}
