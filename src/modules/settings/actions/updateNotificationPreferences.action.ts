'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { cacheTags } from '@/lib/cache/tags'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toSettingsFailure } from '../application/settingsFailure'
import { clinicSettingsRepositoryFor } from '../infrastructure/repository'
import {
  settingsMessages,
  updateNotificationPreferencesSchema,
  type UpdateNotificationPreferencesInput,
} from '../schemas/settings.schema'

type Field = 'operational'

const runUpdateNotificationPreferences = createAction<
  UpdateNotificationPreferencesInput,
  UpdateNotificationPreferencesInput,
  Field
>({
  name: 'clinic.updateNotificationPreferences',
  schema: updateNotificationPreferencesSchema,
  roles: rolesWith('clinic.settings'),
  messages: {
    forbidden: settingsMessages.forbidden,
    validation: settingsMessages.invalidFields,
    unavailable: settingsMessages.unavailable,
    unexpected: settingsMessages.unexpected,
  },
  cacheTags: ({ clinicId }) => [cacheTags.clinicSettings(clinicId)],
  revalidatePaths: ['/configuracoes'],

  handler: async (input, context) => {
    const repository = clinicSettingsRepositoryFor(context.supabase)

    try {
      const preferences = await repository.updateNotificationPreferences(
        context.clinicId,
        input,
      )

      return ok<UpdateNotificationPreferencesInput>(preferences)
    } catch (cause) {
      return toSettingsFailure<Field>(
        'clinic.updateNotificationPreferences',
        cause,
      )
    }
  },

  audit: (output) => ({
    action: 'clinic.notification_preferences_updated',
    entityType: 'clinic',
    entityId: null,
    after: { operational: output.operational },
  }),
})

export async function updateNotificationPreferencesAction(
  rawInput: unknown,
): Promise<ActionResult<UpdateNotificationPreferencesInput, Field>> {
  return runUpdateNotificationPreferences(rawInput)
}
