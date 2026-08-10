import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/supabase/database.types'

import type { NotificationRepository } from '../domain/NotificationRepository'
import { SupabaseNotificationRepository } from './SupabaseNotificationRepository'

export async function getNotificationRepository(): Promise<NotificationRepository | null> {
  const client = await createSupabaseServerClient()
  return client ? new SupabaseNotificationRepository(client) : null
}

export function notificationRepositoryFor(
  client: SupabaseClient<Database>,
): NotificationRepository {
  return new SupabaseNotificationRepository(client)
}
