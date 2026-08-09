import 'server-only'

import { redirect } from 'next/navigation'
import type { SupabaseClient } from '@supabase/supabase-js'

import { resolveDataSource } from '@/lib/data-source'
import type { Database } from '@/lib/supabase/database.types'

import type { FormResponseRepository } from '../domain/FormResponseRepository'
import type { FormRepository } from '../domain/FormRepository'
import { MockFormRepository } from './MockFormRepository'
import { SupabaseFormResponseRepository } from './SupabaseFormResponseRepository'
import { SupabaseFormRepository } from './SupabaseFormRepository'

export interface FormRepositorySource {
  repository: FormRepository
  clinicId: string
  isLive: boolean
}

export async function getFormRepository(): Promise<FormRepositorySource> {
  const source = await resolveDataSource()

  if (source.mode === 'supabase') {
    return {
      repository: new SupabaseFormRepository(source.client),
      clinicId: source.clinicId,
      isLive: true,
    }
  }

  if (source.mode === 'needs-onboarding') redirect('/onboarding')
  if (source.mode === 'session-invalid') redirect('/onboarding')

  return {
    repository: new MockFormRepository(),
    clinicId: source.clinicId,
    isLive: false,
  }
}

export function formRepositoryFor(
  client: SupabaseClient<Database>,
): FormRepository {
  return new SupabaseFormRepository(client)
}

export function formResponseRepositoryFor(
  client: SupabaseClient<Database>,
): FormResponseRepository {
  return new SupabaseFormResponseRepository(client)
}
