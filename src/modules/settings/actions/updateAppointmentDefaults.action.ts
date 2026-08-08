'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toSettingsFailure } from '../application/settingsFailure'
import { clinicSettingsRepositoryFor } from '../infrastructure/repository'
import {
  settingsMessages,
  updateAppointmentDefaultsSchema,
  type UpdateAppointmentDefaultsInput,
} from '../schemas/settings.schema'

type Field = 'durationMinutes'

/**
 * Duração padrão do agendamento — feature **C-01**.
 *
 * Diferente do horário de funcionamento, **isto já é consumido**: a rota
 * `/agenda` lê esta configuração e o formulário de novo agendamento abre com a
 * duração selecionada. É a única preferência desta fatia que muda o
 * comportamento do produto hoje, e por isso é a única sem ressalva na tela.
 *
 * Revalida `/agenda` além de `/configuracoes` — quem salvou aqui precisa ver o
 * efeito lá, não na próxima sessão.
 */
const runUpdateAppointmentDefaults = createAction<
  UpdateAppointmentDefaultsInput,
  { durationMinutes: number },
  Field
>({
  name: 'clinic.updateAppointmentDefaults',
  schema: updateAppointmentDefaultsSchema,
  roles: rolesWith('clinic.settings'),
  messages: {
    forbidden: settingsMessages.forbidden,
    validation: settingsMessages.invalidFields,
    unavailable: settingsMessages.unavailable,
    unexpected: settingsMessages.unexpected,
  },
  revalidatePaths: ['/configuracoes', '/agenda'],

  handler: async (input, context) => {
    const repository = clinicSettingsRepositoryFor(context.supabase)

    try {
      const defaults = await repository.updateAppointmentDefaults(
        context.clinicId,
        { durationMinutes: input.durationMinutes },
      )

      return ok({ durationMinutes: defaults.durationMinutes })
    } catch (cause) {
      return toSettingsFailure<Field>('clinic.updateAppointmentDefaults', cause)
    }
  },

  audit: (output) => ({
    action: 'clinic.appointment_defaults_updated',
    entityType: 'clinic',
    entityId: null,
    after: { duration_minutes: output.durationMinutes },
  }),
})

export async function updateAppointmentDefaultsAction(
  rawInput: unknown,
): Promise<ActionResult<{ durationMinutes: number }, Field>> {
  return runUpdateAppointmentDefaults(rawInput)
}
