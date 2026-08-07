import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, PatientRow } from '@/lib/supabase/database.types'
import type { Patient } from '@/modules/_shared/domain/types'

import type { NewPatientData, PatientRepository } from '../domain/PatientRepository'
import { PatientRepositoryError } from '../domain/PatientRepositoryError'
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
   * Insere o paciente na clinica ativa.
   *
   * `clinic_id` e `created_by` chegam por parametro, do `ActionContext` — nunca do
   * formulario. A RLS ainda recusaria a clinica errada, mas a assinatura ja tira a
   * tentacao de aceita-los do cliente (P3 de docs/01-arquitetura.md).
   *
   * Os valores fixos sao os que o schema remoto exige e o formulario nao coleta:
   *
   *  - `biological_sex: 'not_informed'` — a coluna e NOT NULL e o enum tem esse
   *    valor exato; e a unica forma honesta de dizer "ninguem informou".
   *  - `address: {}` — a coluna e `jsonb` NOT NULL; objeto vazio e "sem endereco",
   *    nao um endereco falso.
   *  - `is_active: true` — cadastro novo entra ativo. Arquivar e outra fatia.
   *
   * Nenhum default de banco e presumido: o que a coluna exige, o insert manda.
   */
  async create(
    clinicId: string,
    data: NewPatientData,
    createdBy: string,
  ): Promise<Patient> {
    const { data: row, error } = await this.client
      .from('patients')
      .insert({
        clinic_id: clinicId,
        full_name: data.fullName,
        birth_date: data.birthDate,
        biological_sex: 'not_informed',
        phone: data.phone,
        email: data.email,
        address: {},
        admin_notes: data.adminNotes,
        is_active: true,
        created_by: createdBy,
      })
      .select('*')
      .single()

    if (error) throw toWriteError(error)

    // Paciente recem-criado nao tem atendimento: nao ha visita a consultar, e uma
    // consulta a `appointments` aqui seria uma ida de rede para receber vazio.
    return toPatient(row as PatientRow)
  }

  /**
   * Atualiza o cadastro.
   *
   * `clinic_id` no `where` e defesa em profundidade: a RLS ja recusaria a linha de
   * outra clinica, e o filtro garante que a recusa vire "nao encontrado" em vez de
   * "atualizou zero linhas em silencio".
   *
   * `updated_at` vai explicito porque nao foi possivel confirmar se existe trigger
   * na tabela (P-P3 de docs/07-cadastro-de-pacientes.md). Se existir, o banco
   * sobrescreve — nao ha conflito.
   */
  async update(
    clinicId: string,
    patientId: string,
    data: NewPatientData,
  ): Promise<Patient> {
    const { data: row, error } = await this.client
      .from('patients')
      .update({
        full_name: data.fullName,
        birth_date: data.birthDate,
        phone: data.phone,
        email: data.email,
        admin_notes: data.adminNotes,
        updated_at: new Date().toISOString(),
      })
      .eq('clinic_id', clinicId)
      .eq('id', patientId)
      .is('deleted_at', null)
      .select('*')
      .maybeSingle()

    if (error) throw toWriteError(error)
    if (!row) throw notFound(patientId)

    const visits = await this.loadVisitDates(clinicId, [patientId])

    return toPatient(row as PatientRow, visits.get(patientId))
  }

  async setArchived(
    clinicId: string,
    patientId: string,
    archived: boolean,
  ): Promise<Patient> {
    const { data: row, error } = await this.client
      .from('patients')
      .update({ is_active: !archived, updated_at: new Date().toISOString() })
      .eq('clinic_id', clinicId)
      .eq('id', patientId)
      .is('deleted_at', null)
      .select('*')
      .maybeSingle()

    if (error) throw toWriteError(error)
    if (!row) throw notFound(patientId)

    const visits = await this.loadVisitDates(clinicId, [patientId])

    return toPatient(row as PatientRow, visits.get(patientId))
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

/**
 * Zero linhas afetadas.
 *
 * Pode ser id inexistente, paciente ja excluido, ou paciente de OUTRA clinica —
 * a RLS filtra antes de o `update` ver a linha. As tres situacoes devolvem a
 * mesma coisa de proposito: distinguir "nao existe" de "existe, mas nao e seu"
 * entregaria ao chamador a informacao de que aquele id existe em algum tenant.
 */
function notFound(patientId: string): PatientRepositoryError {
  return new PatientRepositoryError(
    'not-found',
    `nenhuma linha afetada para o paciente ${patientId} na clinica ativa`,
  )
}

/**
 * Traduz a recusa do Postgres para o vocabulario do dominio.
 *
 * A mensagem que sobe daqui e para o LOG DO SERVIDOR — a action nunca a repassa
 * para a tela. `code` e o SQLSTATE, unico dado do erro que a action registra.
 */
function toWriteError(error: {
  code?: string | null
  message?: string | null
}): PatientRepositoryError {
  const code = error.code ?? undefined
  const message = error.message ?? 'sem mensagem'

  // 23505 = unique_violation. Hoje nenhuma coluna que este insert preenche e
  // unica no schema conhecido, mas indices unicos entram sem aviso — e o usuario
  // precisa de uma mensagem melhor que "erro inesperado" se um entrar.
  if (code === '23505') {
    return new PatientRepositoryError('conflict', message, code)
  }

  // 42501 = insufficient_privilege (policy recusou); PGRST301 = JWT invalido.
  if (code === '42501' || code === 'PGRST301') {
    return new PatientRepositoryError('forbidden', message, code)
  }

  // O supabase-js embrulha falha de rede em erro sem SQLSTATE. Sem codigo e sem
  // resposta do banco, o que houve foi indisponibilidade, nao recusa.
  if (!code && /fetch|network|timeout|econnre/i.test(message)) {
    return new PatientRepositoryError('unavailable', message)
  }

  return new PatientRepositoryError('unexpected', message, code)
}
