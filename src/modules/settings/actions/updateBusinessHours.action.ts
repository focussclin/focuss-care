'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toSettingsFailure } from '../application/settingsFailure'
import { toBusinessDayDtos } from '../application/toSettingsDto'
import { clinicSettingsRepositoryFor } from '../infrastructure/repository'
import {
  settingsMessages,
  updateBusinessHoursSchema,
  type BusinessDayDto,
  type UpdateBusinessHoursInput,
} from '../schemas/settings.schema'

type Field = 'days'

/**
 * Horário de funcionamento — feature **C-01**.
 *
 * # O que este horário faz hoje, e o que não faz
 *
 * Ele **registra** quando a clínica atende. Ele **não bloqueia** agendamento
 * fora do expediente: esse bloqueio é A-02, junto com a disponibilidade por
 * profissional (`availability_rules`), e depende de uma constraint no banco que
 * ainda não foi aplicada.
 *
 * A tela diz isso, em texto, ao lado do formulário. É a diferença entre uma
 * configuração honesta e uma que promete um comportamento inexistente — e quem
 * confiasse no bloqueio marcaria consulta para as 22h sem perceber.
 */
const runUpdateBusinessHours = createAction<
  UpdateBusinessHoursInput,
  readonly BusinessDayDto[],
  Field
>({
  name: 'clinic.updateBusinessHours',
  schema: updateBusinessHoursSchema,
  roles: rolesWith('clinic.settings'),
  messages: {
    forbidden: settingsMessages.forbidden,
    validation: settingsMessages.invalidFields,
    unavailable: settingsMessages.unavailable,
    unexpected: settingsMessages.unexpected,
  },
  revalidatePaths: ['/configuracoes'],

  handler: async (input, context) => {
    const repository = clinicSettingsRepositoryFor(context.supabase)

    try {
      const hours = await repository.updateBusinessHours(
        context.clinicId,
        input.days,
      )

      return ok<readonly BusinessDayDto[]>(toBusinessDayDtos(hours))
    } catch (cause) {
      return toSettingsFailure<Field>('clinic.updateBusinessHours', cause)
    }
  },

  /**
   * Resumo, não a semana inteira.
   *
   * `AuditMetadata` só aceita escalares, e a restrição aqui ajuda: três números
   * respondem "o que mudou operacionalmente" — quantos dias a clínica abre e em
   * que janela — sem transformar o log de auditoria em depósito de payload.
   */
  audit: (output) => {
    const openDays = output.filter((day) => !day.closed)

    return {
      action: 'clinic.business_hours_updated',
      entityType: 'clinic',
      entityId: null,
      after: {
        open_days: openDays.length,
        opens_at:
          openDays.map((day) => day.opensAt).sort()[0] ?? null,
        closes_at:
          openDays.map((day) => day.closesAt).sort().at(-1) ?? null,
      },
    }
  },
})

export async function updateBusinessHoursAction(
  rawInput: unknown,
): Promise<ActionResult<readonly BusinessDayDto[], Field>> {
  return runUpdateBusinessHours(rawInput)
}
