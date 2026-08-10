import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import type { NewVitalsData, VitalsEntry } from '../domain/Vitals'
import {
  VitalsRepositoryError,
  type VitalsRepository,
} from '../domain/VitalsRepository'

type Client = SupabaseClient<Database>

const VITALS_SELECT =
  'id, clinic_id, patient_id, encounter_id, measured_at, weight_kg, height_cm, systolic_bp, diastolic_bp, heart_rate, respiratory_rate, temperature_c, spo2, glucose_mgdl, notes, recorded_by'

/**
 * Teto de linhas do histórico.
 *
 * Ordenado por `measured_at` DESCENDENTE, então o que o teto descarta é o
 * passado distante — e não as aferições recentes, que são as que decidem
 * alguma coisa. É a mesma lição do teto de mensagens da Inbox, onde a ordem
 * crescente escondia justamente as conversas ativas.
 */
const VITALS_CAP = 200

interface VitalsRow {
  id: string
  patient_id: string
  encounter_id: string | null
  measured_at: string
  weight_kg: number | null
  height_cm: number | null
  systolic_bp: number | null
  diastolic_bp: number | null
  heart_rate: number | null
  respiratory_rate: number | null
  temperature_c: number | null
  spo2: number | null
  glucose_mgdl: number | null
  notes: string | null
}

function toEntry(row: VitalsRow): VitalsEntry {
  return {
    id: row.id,
    patientId: row.patient_id,
    encounterId: row.encounter_id,
    measuredAt: new Date(row.measured_at),
    weightKg: row.weight_kg,
    heightCm: row.height_cm,
    systolicBp: row.systolic_bp,
    diastolicBp: row.diastolic_bp,
    heartRate: row.heart_rate,
    respiratoryRate: row.respiratory_rate,
    temperatureC: row.temperature_c,
    spo2: row.spo2,
    glucoseMgdl: row.glucose_mgdl,
    notes: row.notes,
  }
}

export class SupabaseVitalsRepository implements VitalsRepository {
  constructor(private readonly client: Client) {}

  async listByPatient(clinicId: string, patientId: string): Promise<VitalsEntry[]> {
    const { data, error } = await this.client
      .from('vitals')
      .select(VITALS_SELECT)
      .eq('clinic_id', clinicId)
      .eq('patient_id', patientId)
      .order('measured_at', { ascending: false })
      .limit(VITALS_CAP)

    if (error) throw toVitalsError(error)
    return (data ?? []).map((row) => toEntry(row as unknown as VitalsRow))
  }

  /**
   * Consultas de VERIFICAÇÃO: só o `id`, e sempre com a clínica no filtro.
   *
   * Elas existem porque a FK de `vitals` é de coluna única e não carrega o
   * tenant. `maybeSingle` sobre `select('id')` é o menor pedido possível — não
   * traz dado de paciente para a memória do servidor só para conferir um
   * vínculo.
   */
  async patientBelongsTo(clinicId: string, patientId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from('patients')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('id', patientId)
      .maybeSingle()

    if (error) throw toVitalsError(error)
    return data !== null
  }

  async encounterBelongsTo(
    clinicId: string,
    encounterId: string,
    patientId: string,
  ): Promise<boolean> {
    // As três condições juntas: clínica, atendimento e paciente. Faltando a
    // última, um atendimento de outro paciente da mesma clínica passaria.
    const { data, error } = await this.client
      .from('encounters')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('id', encounterId)
      .eq('patient_id', patientId)
      .maybeSingle()

    if (error) throw toVitalsError(error)
    return data !== null
  }

  /**
   * Só INSERT. Não há update nem delete neste repositório.
   *
   * `vitals` não tem `updated_at` nem `deleted_at`: a medida é de um instante, e
   * corrigir é registrar de novo. Sem UPDATE, também não existe aqui o caso de
   * "zero linhas afetadas em silêncio" que os outros módulos precisam
   * distinguir — recusa de policy no INSERT chega como erro do Postgres.
   */
  async record(
    clinicId: string,
    recordedBy: string,
    data: NewVitalsData,
  ): Promise<VitalsEntry> {
    const { data: row, error } = await this.client
      .from('vitals')
      .insert({
        clinic_id: clinicId,
        patient_id: data.patientId,
        encounter_id: data.encounterId,
        measured_at: data.measuredAt.toISOString(),
        weight_kg: data.weightKg,
        height_cm: data.heightCm,
        systolic_bp: data.systolicBp,
        diastolic_bp: data.diastolicBp,
        heart_rate: data.heartRate,
        respiratory_rate: data.respiratoryRate,
        temperature_c: data.temperatureC,
        spo2: data.spo2,
        glucose_mgdl: data.glucoseMgdl,
        notes: data.notes,
        recorded_by: recordedBy,
      })
      .select(VITALS_SELECT)
      .single()

    if (error) throw toVitalsError(error)
    if (!row) throw new VitalsRepositoryError('unexpected', 'insert sem retorno')
    return toEntry(row as unknown as VitalsRow)
  }
}

function toVitalsError(error: {
  code?: string | null
  message?: string | null
}): VitalsRepositoryError {
  const code = error.code ?? undefined
  const message = error.message ?? ''

  if (code === '42501' || code === 'PGRST301') {
    return new VitalsRepositoryError('forbidden', 'recusado pela policy', code)
  }
  /*
   * `23503` é chave estrangeira: o paciente (ou o atendimento) não existe nesta
   * clínica. Chamar de "falha inesperada" mandaria tentar de novo uma operação
   * que nunca vai passar.
   */
  if (code === '23503') {
    return new VitalsRepositoryError('not-found', 'paciente ou atendimento ausente', code)
  }
  if (/fetch|network|timeout|econnrefused/i.test(message)) {
    return new VitalsRepositoryError('unavailable', 'falha de conexão', code)
  }
  return new VitalsRepositoryError('unexpected', 'falha ao acessar sinais vitais', code)
}
