import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import type { NewProfessionalData, Professional } from '../domain/Professional'
import {
  ProfessionalError,
  type ProfessionalRepository,
} from '../domain/ProfessionalRepository'

type Client = SupabaseClient<Database>

const PROFESSIONAL_SELECT =
  'id, clinic_id, user_id, display_name, council_type, council_number, council_state, specialties, default_slot_minutes, is_active, deleted_at'

const PROFESSIONAL_CAP = 200

interface ProfessionalRow {
  id: string
  user_id: string | null
  display_name: string
  council_type: Professional['councilType']
  council_number: string | null
  council_state: string | null
  specialties: string[] | null
  default_slot_minutes: number
  is_active: boolean
}

function toProfessional(row: ProfessionalRow): Professional {
  return {
    id: row.id,
    userId: row.user_id,
    displayName: row.display_name,
    councilType: row.council_type,
    councilNumber: row.council_number,
    councilState: row.council_state,
    specialties: row.specialties ?? [],
    agendaColor: null,
    defaultSlotMinutes: row.default_slot_minutes,
    isActive: row.is_active,
  }
}

function toPayload(data: NewProfessionalData) {
  return {
    display_name: data.displayName,
    council_type: data.councilType,
    council_number: data.councilNumber,
    council_state: data.councilState,
    specialties: [...data.specialties],
    default_slot_minutes: data.defaultSlotMinutes,
    user_id: data.userId,
  }
}

export class SupabaseProfessionalRepository implements ProfessionalRepository {
  constructor(private readonly client: Client) {}

  /**
   * `deleted_at is null` — a mesma exclusão lógica que agenda e equipe já
   * filtram.
   *
   * A aplicação não apaga profissional (não há método para isso): desativar
   * tira da operação e mantém o histórico, e `medical_records.author_id` aponta
   * para cá. Mas linhas apagadas por fora existem, e trazê-las colocaria de
   * volta na agenda quem foi removido.
   */
  async list(clinicId: string): Promise<Professional[]> {
    const { data, error } = await this.client
      .from('professionals')
      .select(PROFESSIONAL_SELECT)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .order('display_name', { ascending: true })
      .limit(PROFESSIONAL_CAP)

    if (error) throw toProfessionalError(error)
    return (data ?? []).map((row) => toProfessional(row as unknown as ProfessionalRow))
  }

  async create(clinicId: string, data: NewProfessionalData): Promise<Professional> {
    const { data: row, error } = await this.client
      .from('professionals')
      .insert({ clinic_id: clinicId, is_active: true, ...toPayload(data) })
      .select(PROFESSIONAL_SELECT)
      .single()

    if (error) throw toProfessionalError(error)
    if (!row) throw new ProfessionalError('unexpected', 'insert sem retorno')
    return toProfessional(row as unknown as ProfessionalRow)
  }

  async update(
    clinicId: string,
    professionalId: string,
    data: NewProfessionalData,
  ): Promise<Professional> {
    return this.patch(clinicId, professionalId, {
      ...toPayload(data),
      updated_at: new Date().toISOString(),
    })
  }

  async setActive(
    clinicId: string,
    professionalId: string,
    isActive: boolean,
  ): Promise<Professional> {
    return this.patch(clinicId, professionalId, {
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
  }

  /**
   * O usuário é membro ativo DESTA clínica?
   *
   * `professionals.user_id` referencia `profiles.id` — coluna única. Ela prova
   * que o usuário existe em algum lugar do banco, não que pertence aqui.
   * Vincular alguém de fora lhe daria a assinatura clínica desta clínica, que é
   * o que `current_professional_id()` resolve.
   */
  async userBelongsToClinic(clinicId: string, userId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from('memberships')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('user_id', userId)
      .eq('status', 'active')
      .maybeSingle()

    if (error) throw toProfessionalError(error)
    return data !== null
  }

  /**
   * UPDATE que distingue "sumiu" de "a policy recusou".
   *
   * `professionals` já existe no banco aplicado com RLS ativa, mas a
   * verificação registrada em `docs/03-banco-de-dados.md` cobriu leitura
   * anônima, não escrita autenticada.
   */
  private async patch(
    clinicId: string,
    professionalId: string,
    patch: Database['public']['Tables']['professionals']['Update'],
  ): Promise<Professional> {
    const { data, error } = await this.client
      .from('professionals')
      .update(patch)
      .eq('clinic_id', clinicId)
      .eq('id', professionalId)
      .is('deleted_at', null)
      .select(PROFESSIONAL_SELECT)
      .maybeSingle()

    if (error) throw toProfessionalError(error)
    if (data) return toProfessional(data as unknown as ProfessionalRow)

    const { data: existing, error: readError } = await this.client
      .from('professionals')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('id', professionalId)
      .is('deleted_at', null)
      .maybeSingle()

    if (readError) throw toProfessionalError(readError)
    if (existing) {
      throw new ProfessionalError(
        'write-forbidden',
        'o profissional é legível mas a escrita foi recusada',
      )
    }
    throw new ProfessionalError('not-found', 'profissional indisponível nesta clínica')
  }
}

function toProfessionalError(error: {
  code?: string | null
  message?: string | null
}): ProfessionalError {
  const code = error.code ?? undefined
  const message = error.message ?? ''

  if (code === '42501' || code === 'PGRST301') {
    return new ProfessionalError('forbidden', 'recusado pela policy', code)
  }
  /*
   * Índice único em `user_id`, se existir: o mesmo usuário não pode ser dois
   * profissionais, senão `current_professional_id()` não sabe qual devolver.
   */
  if (code === '23505') {
    return new ProfessionalError('user-already-linked', 'usuário já vinculado', code)
  }
  if (/fetch|network|timeout|econnrefused/i.test(message)) {
    return new ProfessionalError('unavailable', 'falha de conexão', code)
  }
  return new ProfessionalError('unexpected', 'falha ao acessar profissionais', code)
}
