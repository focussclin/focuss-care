import 'server-only'

import { redirect } from 'next/navigation'

import { resolveDataSource } from '@/lib/data-source'

import type { ReportingRepository } from '../domain/ReportingRepository'
import { MockReportingRepository } from './MockReportingRepository'
import { SupabaseReportingRepository } from './SupabaseReportingRepository'

/**
 * Composição dos indicadores.
 *
 * Não há variante `...For(client)` como nos demais módulos: aquela existe para
 * a escrita, que recebe o cliente já com sessão do `createAction`. Este módulo
 * **só lê** — ver o JSDoc da porta.
 */
export async function getReportingRepository(): Promise<{
  repository: ReportingRepository
  clinicId: string
  isLive: boolean
}> {
  const source = await resolveDataSource()

  if (source.mode === 'supabase') {
    return {
      repository: new SupabaseReportingRepository(source.client),
      clinicId: source.clinicId,
      isLive: true,
    }
  }

  if (source.mode === 'needs-onboarding') redirect('/onboarding')
  if (source.mode === 'session-invalid') redirect('/onboarding')

  return {
    repository: new MockReportingRepository(),
    clinicId: source.clinicId,
    isLive: false,
  }
}
