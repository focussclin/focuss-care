import 'server-only'

import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'

import { resolveDataSource } from '@/lib/data-source'
import type { Database } from '@/lib/supabase/database.types'

import type { RoomRepository } from '../domain/RoomRepository'
import { MockRoomRepository } from './MockRoomRepository'
import { SupabaseRoomRepository } from './SupabaseRoomRepository'

export async function getRoomRepository(): Promise<{
  repository: RoomRepository
  clinicId: string
  isLive: boolean
}> {
  const source = await resolveDataSource()

  if (source.mode === 'supabase') {
    return {
      repository: new SupabaseRoomRepository(source.client),
      clinicId: source.clinicId,
      isLive: true,
    }
  }

  if (source.mode === 'needs-onboarding') redirect('/onboarding')
  if (source.mode === 'session-invalid') redirect('/onboarding')

  return {
    repository: new MockRoomRepository(),
    clinicId: source.clinicId,
    isLive: false,
  }
}

export function roomRepositoryFor(
  client: SupabaseClient<Database>,
): RoomRepository {
  return new SupabaseRoomRepository(client)
}
