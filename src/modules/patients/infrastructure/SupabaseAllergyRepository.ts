import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import type { Allergy, AllergyUpdateData, NewAllergyData } from '../domain/Allergy'
import {
  AllergyRepositoryError,
  type AllergyRepository,
} from '../domain/AllergyRepository'

type Client = SupabaseClient<Database>

/**
 * `severity` fica FORA do select, e não só das escritas.
 *
 * Ler a coluna a colocaria no DTO, e um número no DTO acaba na tela — sob uma
 * escala que ninguém verificou. Não lê, não grava, não mostra: enquanto a
 * convenção não for provada, a coluna não existe para esta aplicação.
 */
const ALLERGY_SELECT =
  'id, clinic_id, patient_id, substance, reaction, is_active, recorded_by, created_at'

const ALLERGY_CAP = 200

interface AllergyRow {
  id: string
  patient_id: string
  substance: string
  reaction: string | null
  is_active: boolean
  recorded_by: string | null
  created_at: string
}

function toAllergy(row: AllergyRow): Allergy {
  return {
    id: row.id,
    patientId: row.patient_id,
    substance: row.substance,
    reaction: row.reaction,
    isActive: row.is_active,
    recordedBy: row.recorded_by,
    recordedAt: new Date(row.created_at),
  }
}

export class SupabaseAllergyRepository implements AllergyRepository {
  constructor(private readonly client: Client) {}

  async listByPatient(clinicId: string, patientId: string): Promise<Allergy[]> {
    const { data, error } = await this.client
      .from('allergies')
      .select(ALLERGY_SELECT)
      .eq('clinic_id', clinicId)
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })
      .limit(ALLERGY_CAP)

    if (error) throw toAllergyError(error)
    return (data ?? []).map((row) => toAllergy(row as unknown as AllergyRow))
  }

  async findById(clinicId: string, allergyId: string): Promise<Allergy | null> {
    const { data, error } = await this.client
      .from('allergies')
      .select(ALLERGY_SELECT)
      .eq('clinic_id', clinicId)
      .eq('id', allergyId)
      .maybeSingle()

    if (error) throw toAllergyError(error)
    return data ? toAllergy(data as unknown as AllergyRow) : null
  }

  async record(
    clinicId: string,
    recordedBy: string,
    data: NewAllergyData,
  ): Promise<Allergy> {
    const { data: row, error } = await this.client
      .from('allergies')
      .insert({
        clinic_id: clinicId,
        patient_id: data.patientId,
        substance: data.substance,
        reaction: data.reaction,
        is_active: true,
        recorded_by: recordedBy,
      })
      .select(ALLERGY_SELECT)
      .single()

    if (error) throw toAllergyError(error)
    if (!row) throw new AllergyRepositoryError('unexpected', 'insert sem retorno')
    return toAllergy(row as unknown as AllergyRow)
  }

  async update(
    clinicId: string,
    allergyId: string,
    data: AllergyUpdateData,
  ): Promise<Allergy> {
    return this.patch(clinicId, allergyId, {
      substance: data.substance,
      reaction: data.reaction,
    })
  }

  async setActive(
    clinicId: string,
    allergyId: string,
    isActive: boolean,
  ): Promise<Allergy> {
    return this.patch(clinicId, allergyId, { is_active: isActive })
  }

  /**
   * UPDATE que distingue "sumiu" de "a policy recusou".
   *
   * `allergies` já existe no banco aplicado com RLS ativa, mas a verificação
   * registrada em `docs/03-banco-de-dados.md` cobriu leitura anônima, não
   * escrita autenticada. Sem policy de UPDATE, zero linhas mudam sem erro.
   */
  private async patch(
    clinicId: string,
    allergyId: string,
    patch: Database['public']['Tables']['allergies']['Update'],
  ): Promise<Allergy> {
    const { data, error } = await this.client
      .from('allergies')
      .update(patch)
      .eq('clinic_id', clinicId)
      .eq('id', allergyId)
      .select(ALLERGY_SELECT)
      .maybeSingle()

    if (error) throw toAllergyError(error)
    if (data) return toAllergy(data as unknown as AllergyRow)

    const { data: existing, error: readError } = await this.client
      .from('allergies')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('id', allergyId)
      .maybeSingle()

    if (readError) throw toAllergyError(readError)
    if (existing) {
      throw new AllergyRepositoryError(
        'write-forbidden',
        'a alergia é legível mas a escrita foi recusada',
      )
    }
    throw new AllergyRepositoryError('not-found', 'alergia indisponível nesta clínica')
  }
}

function toAllergyError(error: {
  code?: string | null
  message?: string | null
}): AllergyRepositoryError {
  const code = error.code ?? undefined
  const message = error.message ?? ''

  if (code === '42501' || code === 'PGRST301') {
    return new AllergyRepositoryError('forbidden', 'recusado pela policy', code)
  }
  /*
   * Se o banco tiver índice único por (clínica, paciente, substância), a
   * segunda entrada bate aqui. A aplicação já checa antes para dar mensagem
   * melhor, mas a checagem dela tem janela de corrida — esta não tem.
   */
  if (code === '23505') {
    return new AllergyRepositoryError('duplicate', 'substância já registrada', code)
  }
  if (/fetch|network|timeout|econnrefused/i.test(message)) {
    return new AllergyRepositoryError('unavailable', 'falha de conexão', code)
  }
  return new AllergyRepositoryError('unexpected', 'falha ao acessar alergias', code)
}
