import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'
import type {
  Appointment,
  AppointmentStatus,
  Professional,
} from '@/modules/_shared/domain/types'

import type { AppointmentRepository } from '../domain/AppointmentRepository'

type Client = SupabaseClient<Database>

/**
 * Linha do join usado nas consultas de agenda.
 *
 * O schema remoto guarda o intervalo como starts_at/ends_at; o dominio trabalha com
 * duracao em minutos, porque e assim que a grade posiciona os blocos. A conversao
 * acontece aqui, nao na UI.
 */
type AppointmentJoinRow = {
  id: string
  patient_id: string
  professional_id: string
  reason: string | null
  starts_at: string
  ends_at: string
  status: AppointmentStatus
  internal_notes: string | null
  patients: { full_name: string } | null
  professionals: { display_name: string } | null
}

const SELECT_WITH_NAMES = `
  id,
  patient_id,
  professional_id,
  reason,
  starts_at,
  ends_at,
  status,
  internal_notes,
  patients ( full_name ),
  professionals ( display_name )
`

function toAppointment(row: AppointmentJoinRow): Appointment {
  const startsAt = new Date(row.starts_at)
  const endsAt = new Date(row.ends_at)

  return {
    id: row.id,
    patientId: row.patient_id,
    patientName: row.patients?.full_name ?? 'Paciente',
    professionalId: row.professional_id,
    professionalName: row.professionals?.display_name ?? 'Profissional',
    type: row.reason ?? 'Atendimento',
    startsAt,
    durationMinutes: Math.max(
      Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000),
      5,
    ),
    status: row.status,
    notes: row.internal_notes ?? undefined,
  }
}

export class SupabaseAppointmentRepository implements AppointmentRepository {
  constructor(private readonly client: Client) {}

  async listByRange(
    clinicId: string,
    from: Date,
    to: Date,
  ): Promise<Appointment[]> {
    const { data, error } = await this.client
      .from('appointments')
      .select(SELECT_WITH_NAMES)
      .eq('clinic_id', clinicId)
      .gte('starts_at', from.toISOString())
      .lt('starts_at', to.toISOString())
      .order('starts_at', { ascending: true })

    if (error) {
      throw new Error(`Falha ao carregar a agenda: ${error.message}`)
    }

    return (data as unknown as AppointmentJoinRow[]).map(toAppointment)
  }

  async listByPatient(
    clinicId: string,
    patientId: string,
  ): Promise<Appointment[]> {
    const { data, error } = await this.client
      .from('appointments')
      .select(SELECT_WITH_NAMES)
      .eq('clinic_id', clinicId)
      .eq('patient_id', patientId)
      .order('starts_at', { ascending: false })

    if (error) {
      throw new Error(
        `Falha ao carregar os atendimentos do paciente: ${error.message}`,
      )
    }

    return (data as unknown as AppointmentJoinRow[]).map(toAppointment)
  }

  async listProfessionals(clinicId: string): Promise<Professional[]> {
    const { data, error } = await this.client
      .from('professionals')
      .select('id, display_name, specialties')
      .eq('clinic_id', clinicId)
      .eq('is_active', true)
      .order('display_name', { ascending: true })

    if (error) {
      throw new Error(`Falha ao carregar os profissionais: ${error.message}`)
    }

    return (data ?? []).map((row) => ({
      id: row.id,
      name: row.display_name,
      // A UI mostra uma especialidade; o banco guarda a lista completa.
      specialty: row.specialties[0] ?? '',
    }))
  }
}
