import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, PatientRow } from '@/lib/supabase/database.types'
import type { Patient } from '@/modules/_shared/domain/types'

import type { PatientRepository } from '../domain/PatientRepository'
import { toPatient } from './patientMapper'

type Client = SupabaseClient<Database>

/**
 * Adapter Supabase.
 *
 * O filtro por clinic_id e explicito mesmo com RLS ativa: e defesa em profundidade.
 * A RLS impede o vazamento; o filtro impede a consulta errada — e mantem a query
 * alinhada ao indice (clinic_id, ...).
 */
export class SupabasePatientRepository implements PatientRepository {
  constructor(private readonly client: Client) {}

  async listByClinic(clinicId: string): Promise<Patient[]> {
    const { data, error } = await this.client
      .from('patients')
      .select('*')
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .order('full_name', { ascending: true })

    if (error) {
      throw new Error(`Falha ao carregar pacientes: ${error.message}`)
    }

    const rows = (data ?? []) as PatientRow[]
    const visits = await this.loadVisitDates(
      clinicId,
      rows.map((row) => row.id),
    )

    return rows.map((row) => toPatient(row, visits.get(row.id)))
  }

  async findById(
    clinicId: string,
    patientId: string,
  ): Promise<Patient | null> {
    const { data, error } = await this.client
      .from('patients')
      .select('*')
      .eq('clinic_id', clinicId)
      .eq('id', patientId)
      .is('deleted_at', null)
      .maybeSingle()

    if (error) {
      throw new Error(`Falha ao carregar o paciente: ${error.message}`)
    }

    if (!data) return null

    const visits = await this.loadVisitDates(clinicId, [patientId])

    return toPatient(data as PatientRow, visits.get(patientId))
  }

  /**
   * Ultima e proxima visita de cada paciente, em uma consulta so.
   * Evita o N+1 que sairia de buscar as datas paciente a paciente.
   */
  private async loadVisitDates(
    clinicId: string,
    patientIds: readonly string[],
  ): Promise<Map<string, { lastVisitAt: Date | null; nextVisitAt: Date | null }>> {
    const result = new Map<
      string,
      { lastVisitAt: Date | null; nextVisitAt: Date | null }
    >()

    if (patientIds.length === 0) return result

    const { data, error } = await this.client
      .from('appointments')
      .select('patient_id, starts_at, status')
      .eq('clinic_id', clinicId)
      .in('patient_id', [...patientIds])
      .not('status', 'in', '("canceled","no_show")')
      .order('starts_at', { ascending: true })

    if (error) {
      throw new Error(`Falha ao carregar os atendimentos: ${error.message}`)
    }

    const now = Date.now()

    for (const row of data ?? []) {
      const startsAt = new Date(row.starts_at)
      const current = result.get(row.patient_id) ?? {
        lastVisitAt: null,
        nextVisitAt: null,
      }

      if (startsAt.getTime() < now) {
        // Ordenacao ascendente: a ultima passada sobrescreve ate sobrar a mais recente.
        current.lastVisitAt = startsAt
      } else if (current.nextVisitAt === null) {
        // Primeira futura encontrada e a proxima.
        current.nextVisitAt = startsAt
      }

      result.set(row.patient_id, current)
    }

    return result
  }
}
