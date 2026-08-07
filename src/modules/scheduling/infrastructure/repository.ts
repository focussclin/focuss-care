import 'server-only'

import { resolveDataSource } from '@/lib/data-source'

import type { AppointmentRepository } from '../domain/AppointmentRepository'
import { MockAppointmentRepository } from './MockAppointmentRepository'
import { SupabaseAppointmentRepository } from './SupabaseAppointmentRepository'

export async function getAppointmentRepository(today: Date): Promise<{
  repository: AppointmentRepository
  clinicId: string
  isLive: boolean
}> {
  const source = await resolveDataSource()

  if (source.mode === 'supabase') {
    return {
      repository: new SupabaseAppointmentRepository(source.client),
      clinicId: source.clinicId,
      isLive: true,
    }
  }

  return {
    repository: new MockAppointmentRepository(today),
    clinicId: source.clinicId,
    isLive: false,
  }
}
