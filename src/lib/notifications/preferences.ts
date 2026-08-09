/** Preferências de avisos que alteram comportamento do centro in-app. */
export interface NotificationPreferences {
  /** Quando falso, eventos operacionais não criam novos avisos. */
  operational: boolean
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  operational: true,
}

/**
 * JSONB é uma fronteira sem schema no Postgres. Valores antigos, incompletos ou
 * editados fora da aplicação voltam ao padrão seguro: avisar, nunca silenciar
 * uma operação sem que a clínica tenha escolhido isso explicitamente.
 */
export function parseNotificationPreferences(
  value: unknown,
): NotificationPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return DEFAULT_NOTIFICATION_PREFERENCES
  }

  const operational = (value as { operational?: unknown }).operational

  return typeof operational === 'boolean'
    ? { operational }
    : DEFAULT_NOTIFICATION_PREFERENCES
}
