import 'server-only'

import { redirect } from 'next/navigation'

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

  // Mesma regra do repositorio de pacientes: sem clinica, sem dado ficticio.
  if (source.mode === 'needs-onboarding') redirect('/onboarding')
  if (source.mode === 'session-invalid') redirect('/onboarding')

  return {
    repository: new MockAppointmentRepository(today),
    clinicId: source.clinicId,
    isLive: false,
  }
}
