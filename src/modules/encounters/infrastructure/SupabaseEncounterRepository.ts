import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import type {
  Encounter,
  EncounterMetrics,
  EncounterStatus,
  QueueEntry,
  QueueStatus,
} from '../domain/Encounter'
import type {
  CheckInData,
  EncounterRepository,
} from '../domain/EncounterRepository'
import { EncounterRepositoryError } from '../domain/EncounterRepositoryError'

type Client = SupabaseClient<Database>

const QUEUE_SELECT = `
  id,
  patient_id,
  appointment_id,
  professional_id,
  priority,
  status,
  reason,
  arrived_at,
  called_at,
  started_at,
  finished_at,
  patients ( full_name ),
  professionals ( display_name )
`

const ENCOUNTER_SELECT = `
  id,
  patient_id,
  professional_id,
  appointment_id,
  status,
  chief_complaint,
  started_at,
  ended_at,
  patients ( full_name ),
  professionals ( display_name )
`

type QueueJoinRow = {
  id: string
  patient_id: string
  appointment_id: string | null
  professional_id: string | null
  priority: number
  status: QueueStatus
  reason: string | null
  arrived_at: string
  called_at: string | null
  started_at: string | null
  finished_at: string | null
  patients: { full_name: string } | null
  professionals: { display_name: string } | null
}

type EncounterJoinRow = {
  id: string
  patient_id: string
  professional_id: string
  appointment_id: string | null
  status: EncounterStatus
  chief_complaint: string | null
  started_at: string
  ended_at: string | null
  patients: { full_name: string } | null
  professionals: { display_name: string } | null
}

function toQueueEntry(row: QueueJoinRow): QueueEntry {
  return {
    id: row.id,
    patientId: row.patient_id,
    patientName: row.patients?.full_name ?? 'Paciente',
    appointmentId: row.appointment_id,
    professionalId: row.professional_id,
    professionalName: row.professionals?.display_name ?? null,
    priority: row.priority,
    status: row.status,
    reason: row.reason,
    arrivedAt: new Date(row.arrived_at),
    calledAt: row.called_at ? new Date(row.called_at) : null,
    startedAt: row.started_at ? new Date(row.started_at) : null,
    finishedAt: row.finished_at ? new Date(row.finished_at) : null,
  }
}

function toEncounter(row: EncounterJoinRow): Encounter {
  return {
    id: row.id,
    patientId: row.patient_id,
    patientName: row.patients?.full_name ?? 'Paciente',
    professionalId: row.professional_id,
    professionalName: row.professionals?.display_name ?? 'Profissional',
    appointmentId: row.appointment_id,
    status: row.status,
    chiefComplaint: row.chief_complaint,
    startedAt: new Date(row.started_at),
    endedAt: row.ended_at ? new Date(row.ended_at) : null,
  }
}

/** Início e fim do dia de referência, no fuso do servidor. */
function dayBounds(day: Date): { from: string; to: string } {
  const from = new Date(day)
  from.setHours(0, 0, 0, 0)

  const to = new Date(from)
  to.setDate(to.getDate() + 1)

  return { from: from.toISOString(), to: to.toISOString() }
}

/**
 * Adapter Supabase do atendimento.
 *
 * O filtro por `clinic_id` é explícito mesmo com RLS ativa: é defesa em
 * profundidade. A RLS impede o vazamento; o filtro impede a consulta errada — e
 * mantém a query alinhada ao índice `(clinic_id, ...)`.
 */
export class SupabaseEncounterRepository implements EncounterRepository {
  constructor(private readonly client: Client) {}

  async listQueue(clinicId: string, day: Date): Promise<QueueEntry[]> {
    const { from, to } = dayBounds(day)

    const { data, error } = await this.client
      .from('waiting_queue')
      .select(QUEUE_SELECT)
      .eq('clinic_id', clinicId)
      .gte('arrived_at', from)
      .lt('arrived_at', to)
      // Prioridade primeiro, chegada depois: é a ordem que a recepção anuncia,
      // e trocá-la faria a fila da tela discordar da fila da sala de espera.
      .order('priority', { ascending: true })
      .order('arrived_at', { ascending: true })

    if (error) throw readFailure('listQueue', error)

    return (data as unknown as QueueJoinRow[]).map(toQueueEntry)
  }

  async listEncounters(clinicId: string, day: Date): Promise<Encounter[]> {
    const { from, to } = dayBounds(day)

    const { data, error } = await this.client
      .from('encounters')
      .select(ENCOUNTER_SELECT)
      .eq('clinic_id', clinicId)
      .gte('started_at', from)
      .lt('started_at', to)
      .order('started_at', { ascending: false })

    if (error) throw readFailure('listEncounters', error)

    return (data as unknown as EncounterJoinRow[]).map(toEncounter)
  }

  /**
   * Contagens do topo — três `head: true`, que devolvem número sem linha.
   *
   * Não derivam da lista de propósito: a tela mostra o dia, e "concluídos" de
   * um dia cheio não cabe em uma lista paginada.
   */
  async countMetrics(
    clinicId: string,
    day: Date,
  ): Promise<EncounterMetrics> {
    const { from, to } = dayBounds(day)

    const [waiting, inService, closedToday] = await Promise.all([
      this.countQueue(clinicId, from, to, ['waiting', 'called']),
      this.countQueue(clinicId, from, to, ['in_service']),
      this.countClosedEncounters(clinicId, from, to),
    ])

    return { waiting, inService, closedToday }
  }

  private async countQueue(
    clinicId: string,
    from: string,
    to: string,
    statuses: readonly QueueStatus[],
  ): Promise<number> {
    const { count, error } = await this.client
      .from('waiting_queue')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .gte('arrived_at', from)
      .lt('arrived_at', to)
      .in('status', [...statuses])

    if (error) throw readFailure('countQueue', error)

    return count ?? 0
  }

  private async countClosedEncounters(
    clinicId: string,
    from: string,
    to: string,
  ): Promise<number> {
    const { count, error } = await this.client
      .from('encounters')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .eq('status', 'closed')
      .gte('started_at', from)
      .lt('started_at', to)

    if (error) throw readFailure('countClosedEncounters', error)

    return count ?? 0
  }

  async checkIn(clinicId: string, data: CheckInData): Promise<QueueEntry> {
    const { data: row, error } = await this.client
      .from('waiting_queue')
      .insert({
        clinic_id: clinicId,
        patient_id: data.patientId,
        appointment_id: data.appointmentId,
        professional_id: data.professionalId,
        priority: data.priority,
        status: 'waiting',
        reason: data.reason,
        // Sem default no schema remoto, e é o dado que sustenta o tempo de
        // espera: a hora da chegada é o marco zero de tudo que vem depois.
        arrived_at: new Date().toISOString(),
      })
      .select(QUEUE_SELECT)
      .single()

    if (error) throw toWriteError(error)

    return toQueueEntry(row as unknown as QueueJoinRow)
  }

  /**
   * `waiting` -> `called`.
   *
   * O `eq('status', 'waiting')` no `where` é o que torna a transição segura sob
   * concorrência: se outra recepcionista já chamou, esta atualização não acha
   * linha e vira `invalid-transition` em vez de sobrescrever `called_at`.
   */
  async call(clinicId: string, queueEntryId: string): Promise<QueueEntry> {
    const { data: row, error } = await this.client
      .from('waiting_queue')
      .update({ status: 'called', called_at: new Date().toISOString() })
      .eq('clinic_id', clinicId)
      .eq('id', queueEntryId)
      .eq('status', 'waiting')
      .select(QUEUE_SELECT)
      .maybeSingle()

    if (error) throw toWriteError(error)
    if (!row) throw invalidTransition(queueEntryId, 'chamar')

    return toQueueEntry(row as unknown as QueueJoinRow)
  }

  /**
   * Inicia o atendimento.
   *
   * Duas escritas descrevem o mesmo instante: a fila entra em `in_service` e
   * nasce o `encounter`. **A fila é atualizada PRIMEIRO, de propósito** — ela
   * carrega a condição de corrida (`status in (waiting, called)`), então é ela
   * que decide se esta chamada tem direito de iniciar. Criar o encounter antes
   * deixaria um atendimento órfão quando duas telas competissem.
   *
   * Não há transação: o PostgREST não a expõe. Se o insert do encounter falhar
   * depois da fila ter mudado, a fila é devolvida ao estado anterior — e o que
   * sobra é o log. A forma correta é uma RPC, e ela é migration.
   */
  async start(
    clinicId: string,
    queueEntryId: string,
    professionalId: string,
    createdBy: string,
  ): Promise<Encounter> {
    const startedAt = new Date().toISOString()

    const { data: queueRow, error: queueError } = await this.client
      .from('waiting_queue')
      .update({
        status: 'in_service',
        professional_id: professionalId,
        started_at: startedAt,
      })
      .eq('clinic_id', clinicId)
      .eq('id', queueEntryId)
      .in('status', ['waiting', 'called'])
      .select('id, patient_id, appointment_id, status')
      .maybeSingle()

    if (queueError) throw toWriteError(queueError)
    if (!queueRow) throw invalidTransition(queueEntryId, 'iniciar')

    const { data: row, error } = await this.client
      .from('encounters')
      .insert({
        clinic_id: clinicId,
        patient_id: queueRow.patient_id,
        professional_id: professionalId,
        appointment_id: queueRow.appointment_id,
        status: 'open',
        started_at: startedAt,
        created_by: createdBy,
      })
      .select(ENCOUNTER_SELECT)
      .single()

    if (error) {
      // Devolve a fila ao estado anterior para a pessoa não ficar presa em
      // "em atendimento" sem atendimento nenhum por trás.
      await this.client
        .from('waiting_queue')
        .update({ status: 'called', started_at: null })
        .eq('clinic_id', clinicId)
        .eq('id', queueEntryId)

      throw toWriteError(error)
    }

    return toEncounter(row as unknown as EncounterJoinRow)
  }

  /**
   * Registra ou corrige a queixa principal — feature **E-03**.
   *
   * `eq('status', 'open')` é a condição de origem, no `WHERE` e não numa leitura
   * anterior: entre a tela carregar e o clique chegar, outra pessoa pode ter
   * encerrado o atendimento. Gravar por cima mudaria a justificativa de uma
   * conduta já tomada.
   *
   * Zero linhas tem três causas, e a releitura as separa — o mesmo padrão do
   * resto do projeto: sumiu, foi encerrado, ou a policy recusou.
   */
  async setChiefComplaint(
    clinicId: string,
    encounterId: string,
    complaint: string | null,
  ): Promise<Encounter> {
    const { data, error } = await this.client
      .from('encounters')
      .update({ chief_complaint: complaint, updated_at: new Date().toISOString() })
      .eq('clinic_id', clinicId)
      .eq('id', encounterId)
      .eq('status', 'open')
      .select(ENCOUNTER_SELECT)
      .maybeSingle()

    if (error) throw toWriteError(error)
    if (data) return toEncounter(data as unknown as EncounterJoinRow)

    const { data: existing, error: readError } = await this.client
      .from('encounters')
      .select('status')
      .eq('clinic_id', clinicId)
      .eq('id', encounterId)
      .maybeSingle()

    if (readError) throw toWriteError(readError)
    if (!existing) {
      throw new EncounterRepositoryError(
        'not-found',
        `atendimento ${encounterId} indisponivel nesta clinica`,
      )
    }

    /*
     * Encerrado é `invalid-transition`, e não `not-found`: o atendimento está
     * lá, e a pessoa precisa saber que a janela fechou — não procurar um
     * registro que não sumiu.
     */
    if (existing.status !== 'open') {
      throw invalidTransition(encounterId, 'registrar a queixa principal')
    }

    /*
     * Legivel e ABERTO, e mesmo assim zero linhas: quem recusou foi a policy.
     * Sem policy de UPDATE o Postgres nao devolve erro — a linha nao e
     * alcancada e nada muda, em silencio.
     */
    throw new EncounterRepositoryError(
      'forbidden',
      `escrita recusada para o atendimento ${encounterId}`,
    )
  }

  /**
   * Encerra o atendimento e libera a fila.
   *
   * `eq('status', 'open')` impede encerrar duas vezes: a segunda tentativa não
   * acha linha e vira `invalid-transition`, em vez de sobrescrever `ended_at` e
   * fazer o atendimento parecer mais curto do que foi.
   */
  async close(clinicId: string, encounterId: string): Promise<Encounter> {
    const endedAt = new Date().toISOString()

    const { data: row, error } = await this.client
      .from('encounters')
      .update({ status: 'closed', ended_at: endedAt, updated_at: endedAt })
      .eq('clinic_id', clinicId)
      .eq('id', encounterId)
      .eq('status', 'open')
      .select(ENCOUNTER_SELECT)
      .maybeSingle()

    if (error) throw toWriteError(error)
    if (!row) throw invalidTransition(encounterId, 'encerrar')

    const encounter = toEncounter(row as unknown as EncounterJoinRow)

    /*
     * A fila fecha depois, e é best-effort: o atendimento JÁ terminou, e
     * recusar o encerramento porque a linha da fila não fechou seria prender o
     * profissional numa sala por causa de bookkeeping da recepção.
     */
    if (encounter.appointmentId !== null) {
      await this.finishQueueByAppointment(clinicId, encounter.appointmentId)
    } else {
      await this.finishQueueByPatient(clinicId, encounter.patientId)
    }

    return encounter
  }

  private async finishQueueByAppointment(
    clinicId: string,
    appointmentId: string,
  ): Promise<void> {
    const { error } = await this.client
      .from('waiting_queue')
      .update({ status: 'done', finished_at: new Date().toISOString() })
      .eq('clinic_id', clinicId)
      .eq('appointment_id', appointmentId)
      .eq('status', 'in_service')

    if (error) logQueueClose(appointmentId, error)
  }

  private async finishQueueByPatient(
    clinicId: string,
    patientId: string,
  ): Promise<void> {
    const { error } = await this.client
      .from('waiting_queue')
      .update({ status: 'done', finished_at: new Date().toISOString() })
      .eq('clinic_id', clinicId)
      .eq('patient_id', patientId)
      .eq('status', 'in_service')

    if (error) logQueueClose(patientId, error)
  }
}

function logQueueClose(
  reference: string,
  error: { code?: string | null; message?: string | null },
): void {
  console.error('[encounters] finishQueue', {
    reference,
    code: error.code ?? null,
    message: error.message ?? null,
  })
}

/**
 * Transição recusada.
 *
 * Não é erro do sistema: é a fila tendo andado enquanto a tela de alguém estava
 * parada. A mensagem que chega ao usuário diz para recarregar, não para tentar
 * de novo.
 */
function invalidTransition(
  id: string,
  operation: string,
): EncounterRepositoryError {
  return new EncounterRepositoryError(
    'invalid-transition',
    `nao foi possivel ${operation}: nenhuma linha em estado valido para ${id}`,
  )
}

/**
 * Falha de LEITURA -> erro genérico na tela, causa só no log do servidor.
 *
 * A mensagem do Postgres não sobe para o boundary: nome de coluna, nome de
 * policy e SQLSTATE são mapa da estrutura interna.
 */
function readFailure(
  context: string,
  error: { code?: string | null; message?: string | null },
): Error {
  console.error(`[encounters] ${context}`, {
    code: error.code ?? null,
    message: error.message ?? null,
  })

  return new Error('Falha ao carregar os atendimentos.')
}

function toWriteError(error: {
  code?: string | null
  message?: string | null
}): EncounterRepositoryError {
  const code = error.code ?? undefined
  const message = error.message ?? 'sem mensagem'

  // 23503 = foreign_key_violation: paciente ou profissional que não existe
  // nesta clínica. Para quem operou, é o mesmo que "não encontrado".
  if (code === '23503') {
    return new EncounterRepositoryError('not-found', message, code)
  }

  if (code === '42501' || code === 'PGRST301') {
    return new EncounterRepositoryError('forbidden', message, code)
  }

  if (!code && /fetch|network|timeout|econnre/i.test(message)) {
    return new EncounterRepositoryError('unavailable', message)
  }

  return new EncounterRepositoryError('unexpected', message, code)
}
