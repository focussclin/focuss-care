'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toSettingsFailure } from '../application/settingsFailure'
import { toClinicProfileDto } from '../application/toSettingsDto'
import { clinicSettingsRepositoryFor } from '../infrastructure/repository'
import {
  settingsMessages,
  updateClinicProfileSchema,
  type ClinicProfileDto,
  type UpdateClinicProfileInput,
} from '../schemas/settings.schema'

type Field = 'tradeName' | 'legalName' | 'cnpj'

/**
 * Identidade da clínica — feature **C-01**.
 *
 * O nome fantasia editado aqui é o mesmo que aparece no seletor de clínicas
 * (I-03) e no cabeçalho: por isso a revalidação é do layout inteiro, e não só
 * de `/configuracoes`. Sem isso, a pessoa salvaria o nome novo e continuaria
 * vendo o antigo no topo da tela, o que parece exatamente com não ter salvo.
 *
 * `slug`, `timezone` e `locale` NÃO estão no schema de entrada. O motivo de cada
 * um está no cabeçalho de `domain/ClinicSettings.ts`.
 */
const runUpdateClinicProfile = createAction<
  UpdateClinicProfileInput,
  ClinicProfileDto,
  Field
>({
  name: 'clinic.updateProfile',
  schema: updateClinicProfileSchema,
  roles: rolesWith('clinic.settings'),
  messages: {
    forbidden: settingsMessages.forbidden,
    validation: settingsMessages.invalidFields,
    unavailable: settingsMessages.unavailable,
    unexpected: settingsMessages.unexpected,
  },
  /*
   * LAYOUT, e não a página raiz — mesmo motivo de `profile.update`.
   *
   * O nome fantasia aparece no cabeçalho e no seletor de clínicas, que são da
   * casca de `(app)`. `revalidatePath('/')` sozinho deixaria o nome antigo no
   * topo de toda rota que a pessoa já tivesse visitado.
   */
  revalidatePaths: [{ path: '/', type: 'layout' }],

  handler: async (input, context) => {
    const repository = clinicSettingsRepositoryFor(context.supabase)

    try {
      const profile = await repository.updateProfile(context.clinicId, {
        tradeName: input.tradeName,
        legalName: input.legalName,
        cnpj: input.cnpj,
      })

      return ok<ClinicProfileDto>(toClinicProfileDto(profile))
    } catch (cause) {
      return toSettingsFailure<Field>('clinic.updateProfile', cause)
    }
  },

  /**
   * Os valores novos entram no log, e isto NÃO contradiz a regra de privacidade
   * da auditoria.
   *
   * A regra existe para dado de paciente: `audit_log` é legível pela operação
   * inteira e é append-only, então conteúdo clínico ou pessoal que entra ali não
   * sai mais. Razão social e CNPJ são o cadastro da própria empresa — estão na
   * nota fiscal, no contrato e nesta mesma tela, que todo membro da clínica
   * enxerga. Registrar quem mudou o CNPJ é justamente o tipo de rastro que uma
   * auditoria societária precisa ter.
   *
   * `entityId` fica nulo de propósito: a linha de `audit_log` já carrega
   * `clinic_id`, derivado da sessão pelo `recordAuditEvent`.
   */
  audit: (output) => ({
    action: 'clinic.profile_updated',
    entityType: 'clinic',
    entityId: null,
    after: {
      trade_name: output.tradeName,
      legal_name: output.legalName,
      cnpj: output.cnpj,
    },
  }),
})

export async function updateClinicProfileAction(
  rawInput: unknown,
): Promise<ActionResult<ClinicProfileDto, Field>> {
  return runUpdateClinicProfile(rawInput)
}
