import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import {
  describeOutsideHours,
  findOutsideBusinessHours,
  parseStoredBusinessHours,
} from '@/lib/clinic/business-hours'
import type { Database } from '@/lib/supabase/database.types'
import type {
  Appointment,
  AppointmentStatus,
  Professional,
} from '@/modules/_shared/domain/types'

import type {
  AppointmentRepository,
  NewAppointmentData,
  ScheduleWriteOptions,
} from '../domain/AppointmentRepository'
import { AppointmentRepositoryError } from '../domain/AppointmentRepositoryError'

type Client = SupabaseClient<Database>

/**
 * Status que NÃO ocupam horário.
 *
 * Um atendimento cancelado ou com falta registrada deixou a agenda livre — a
 * recepção precisa poder remarcar exatamente naquele horário, que é o caso mais
 * comum de todos.
 */
const RELEASES_SLOT = '("canceled","no_show")'

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
  /*
   * Opcionais no TIPO, e não só no valor.
   *
   * Enquanto `20260809_rooms.sql` não for aplicada, `appointments.room_id` não
   * existe e o PostgREST recusaria a consulta inteira se ela pedisse a coluna.
   * Ver `SELECT_WITH_NAMES` logo abaixo: a agenda continua pedindo o select
   * antigo até a migration existir, e estes dois campos chegam `undefined`.
   */
  room_id?: string | null
  rooms?: { name: string } | null
}

/**
 * Colunas da agenda — SEM sala.
 *
 * `room_id` fica de fora de propósito. A coluna só existe depois de
 * `20260809_rooms.sql`, e pedir uma coluna inexistente faz o PostgREST recusar
 * a consulta inteira com `42703` — ou seja, a agenda pararia de carregar para
 * todo mundo por causa de um recurso que ninguém ainda usa.
 *
 * `SELECT_WITH_ROOM` existe logo abaixo e é usado quando a clínica tem salas
 * cadastradas, o que só acontece com a migration aplicada. Ver `selectFor`.
 */
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

/**
 * O `Insert` gerado de `appointments`.
 *
 * Ele NÃO conhece `room_id`, porque é gerado do schema remoto e
 * `20260809_rooms.sql` não foi aplicada — e o tipo gerado rejeita chave
 * excedente. O `as` para este alias é o único ponto do módulo que afirma algo
 * sobre a coluna nova, e sai junto com o `npm run db:types` que seguir a
 * migration.
 */
type AppointmentInsert = Database['public']['Tables']['appointments']['Insert']

/** O mesmo, mais a sala. Só é seguro depois da migration de salas. */
const SELECT_WITH_ROOM = `${SELECT_WITH_NAMES},
  room_id,
  rooms ( name )
`

/**
 * Qual `select` usar.
 *
 * A escolha é EXPLÍCITA — vem de quem chama, que já sabe se a clínica tem salas
 * cadastradas — e não descoberta por tentativa e erro. A alternativa seria
 * pedir a coluna, tomar `42703` e repetir sem ela: funcionaria, e custaria uma
 * consulta a mais em toda abertura da agenda enquanto a migration estivesse
 * pendente, que é justamente o estado de hoje.
 *
 * Quando `20260809_rooms.sql` for aplicada e as clínicas tiverem salas, este
 * parâmetro deixa de ter razão de existir e o `select` com sala passa a ser o
 * único. Ver `docs/supabase-migrations-runbook.md` §3.55.
 */
function selectFor(withRoom: boolean | undefined): string {
  return withRoom ? SELECT_WITH_ROOM : SELECT_WITH_NAMES
}

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
    // `?? null` e nao `?? undefined`: quando o select TROUXE a coluna e ela e
    // nula, "esta consulta sem sala" e um fato — diferente de "nao perguntei".
    roomId: row.room_id ?? null,
    roomName: row.rooms?.name ?? null,
  }
}

export class SupabaseAppointmentRepository implements AppointmentRepository {
  constructor(private readonly client: Client) {}

  async searchByPatientName(
    clinicId: string,
    query: string,
    limit: number,
  ): Promise<Appointment[]> {
    const cleanQuery = query.replace(/[\\%_*(),]/g, ' ').trim()
    if (!cleanQuery) return []

    const { data: patients, error: patientError } = await this.client
      .from('patients')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('is_active', true)
      .ilike('full_name', `%${cleanQuery}%`)
      .limit(Math.min(Math.max(limit * 2, 1), 32))

    if (patientError) {
      throw new Error(`Falha ao buscar pacientes da agenda: ${patientError.message}`)
    }

    const patientIds = (patients ?? []).map((patient) => patient.id)
    if (patientIds.length === 0) return []

    const { data, error } = await this.client
      .from('appointments')
      .select(SELECT_WITH_NAMES)
      .eq('clinic_id', clinicId)
      .in('patient_id', patientIds)
      .not('status', 'in', RELEASES_SLOT)
      .order('starts_at', { ascending: false })
      .limit(Math.min(Math.max(Math.trunc(limit) || 1, 1), 20))

    if (error) throw new Error(`Falha ao buscar atendimentos: ${error.message}`)

    return (data as unknown as AppointmentJoinRow[]).map(toAppointment)
  }

  async listByRange(
    clinicId: string,
    from: Date,
    to: Date,
    options?: { withRoom?: boolean },
  ): Promise<Appointment[]> {
    const { data, error } = await this.client
      .from('appointments')
      .select(selectFor(options?.withRoom))
      .eq('clinic_id', clinicId)
      .gte('starts_at', from.toISOString())
      .lt('starts_at', to.toISOString())
      .order('starts_at', { ascending: true })

    if (error) {
      throw new Error(`Falha ao carregar a agenda: ${error.message}`)
    }

    return (data as unknown as AppointmentJoinRow[]).map(toAppointment)
  }

  async listByProfessionalRange(
    clinicId: string,
    professionalId: string,
    from: Date,
    to: Date,
  ): Promise<Appointment[]> {
    /*
     * Os DOIS filtros são de segurança, e não só de recorte.
     *
     * `clinic_id` é a fronteira de tenant, e a RLS o repete — defesa em
     * profundidade, como no resto do produto. `professional_id` é o que impede
     * o portal de um profissional de trazer a agenda dos colegas: a RLS de
     * `appointments` isola a clínica, não a pessoa, então sem esta linha a
     * consulta voltaria com tudo e a tela é que esconderia. Esconder no
     * navegador não esconde — o payload do RSC continua legível.
     */
    const { data, error } = await this.client
      .from('appointments')
      .select(SELECT_WITH_NAMES)
      .eq('clinic_id', clinicId)
      .eq('professional_id', professionalId)
      .gte('starts_at', from.toISOString())
      .lt('starts_at', to.toISOString())
      .order('starts_at', { ascending: true })

    if (error) {
      throw new Error(`Falha ao carregar a agenda do profissional: ${error.message}`)
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

  /**
   * Cria o atendimento.
   *
   * `clinic_id` e `created_by` chegam por parametro, do `ActionContext` — nunca
   * do formulario. A RLS ainda recusaria a clinica errada, mas a assinatura ja
   * tira a tentacao de aceita-los do cliente (P3 de docs/01-arquitetura.md).
   *
   * `is_walk_in: false` porque isto e agendamento; encaixe sem hora marcada e
   * fila de espera, que e outra fatia (E-01).
   */
  async create(
    clinicId: string,
    data: NewAppointmentData,
    createdBy: string,
    options: ScheduleWriteOptions = {},
  ): Promise<Appointment> {
    // A ordem importa para a mensagem: horário ocupado é recusa definitiva e
    // fora de expediente é pergunta. Perguntar primeiro faria a pessoa confirmar
    // um encaixe que seria recusado logo em seguida por já estar ocupado.
    await this.assertNoConflict(
      clinicId,
      data.professionalId,
      data.startsAt,
      data.endsAt,
    )

    await this.assertWithinBusinessHours(
      clinicId,
      data.startsAt,
      data.endsAt,
      options,
    )

    /*
     * `room_id` só entra no payload quando HÁ sala.
     *
     * Mandar `room_id: null` seria equivalente para o banco — e fatal aqui:
     * enquanto `20260809_rooms.sql` não for aplicada a coluna não existe, e o
     * PostgREST recusa o insert inteiro por citá-la. Toda marcação de consulta
     * pararia por causa de um campo que ninguém preencheu.
     *
     * Com o spread condicional, a clínica sem salas escreve exatamente o mesmo
     * payload de antes desta fatia.
     *
     * O `as` existe porque `database.types.ts` é GERADO do schema remoto, onde
     * `room_id` ainda não existe — e o tipo gerado rejeita chave excedente. É o
     * mesmo motivo dos shims `*Database.ts` dos outros módulos; aqui basta um
     * ponto, porque é a única escrita que cita a coluna. Ele sai junto com o
     * `npm run db:types` que seguir a migration.
     */
    const payload = {
      clinic_id: clinicId,
      patient_id: data.patientId,
      professional_id: data.professionalId,
      status: data.status,
      starts_at: data.startsAt.toISOString(),
      ends_at: data.endsAt.toISOString(),
      reason: data.reason,
      internal_notes: data.notes,
      is_walk_in: false,
      created_by: createdBy,
      ...(data.roomId ? { room_id: data.roomId } : {}),
    }

    const { data: row, error } = await this.client
      .from('appointments')
      .insert(payload as AppointmentInsert)
      .select(selectFor(Boolean(data.roomId)))
      .single()

    if (error) throw toWriteError(error)

    const appointment = toAppointment(row as unknown as AppointmentJoinRow)

    await this.recordStatusChange(clinicId, appointment.id, {
      from: null,
      to: data.status,
      by: createdBy,
      reason: null,
    })

    return appointment
  }

  /**
   * Move o atendimento de horario.
   *
   * O `update` NAO toca em `status`: um atendimento confirmado que muda de hora
   * continua confirmado. Zerar a confirmacao aqui faria a recepcao ligar de
   * novo para um paciente que ja tinha confirmado.
   *
   * `clinic_id` no `where` e defesa em profundidade — a RLS ja recusaria a linha
   * de outra clinica, e o filtro transforma a recusa em "nao encontrado" em vez
   * de "atualizou zero linhas em silencio".
   */
  async reschedule(
    clinicId: string,
    appointmentId: string,
    startsAt: Date,
    endsAt: Date,
    options: ScheduleWriteOptions = {},
  ): Promise<Appointment> {
    /*
     * O profissional sai do BANCO, não da entrada.
     *
     * Remarcar não troca de profissional, então perguntar qual é ao cliente
     * abriria uma porta para verificar o conflito de um profissional e gravar o
     * horário de outro. Uma leitura a mais é o preço de a checagem ser sobre a
     * linha que realmente vai mudar.
     */
    const { data: target, error: targetError } = await this.client
      .from('appointments')
      .select('professional_id')
      .eq('clinic_id', clinicId)
      .eq('id', appointmentId)
      .not('status', 'in', RELEASES_SLOT)
      .maybeSingle()

    if (targetError) throw toWriteError(targetError)
    if (!target) throw notFound(appointmentId)

    await this.assertNoConflict(
      clinicId,
      target.professional_id,
      startsAt,
      endsAt,
      appointmentId,
    )

    await this.assertWithinBusinessHours(clinicId, startsAt, endsAt, options)

    const { data: row, error } = await this.client
      .from('appointments')
      .update({
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('clinic_id', clinicId)
      .eq('id', appointmentId)
      // Remarcar um atendimento cancelado seria ressuscita-lo pela porta dos
      // fundos, sem passar por nenhuma decisao de quem cancelou.
      .not('status', 'in', RELEASES_SLOT)
      .select(SELECT_WITH_NAMES)
      .maybeSingle()

    if (error) throw toWriteError(error)
    if (!row) throw notFound(appointmentId)

    return toAppointment(row as unknown as AppointmentJoinRow)
  }

  /**
   * Cancela — sem apagar.
   *
   * A linha continua na base com `status = 'canceled'`, `canceled_at` e o
   * motivo. Agenda de saude e registro do que foi combinado, inclusive do que
   * foi desmarcado; e o §8 do roadmap proibe `DELETE` de qualquer forma.
   */
  async cancel(
    clinicId: string,
    appointmentId: string,
    reason: string | null,
    canceledBy: string,
  ): Promise<Appointment> {
    // O status anterior e lido ANTES do update: depois dele a informacao some,
    // e e ela que o historico precisa para dizer de onde a linha veio.
    const { data: current } = await this.client
      .from('appointments')
      .select('status')
      .eq('clinic_id', clinicId)
      .eq('id', appointmentId)
      .maybeSingle()

    const { data: row, error } = await this.client
      .from('appointments')
      .update({
        status: 'canceled',
        canceled_at: new Date().toISOString(),
        cancel_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq('clinic_id', clinicId)
      .eq('id', appointmentId)
      .neq('status', 'canceled')
      .select(SELECT_WITH_NAMES)
      .maybeSingle()

    if (error) throw toWriteError(error)
    if (!row) throw notFound(appointmentId)

    const appointment = toAppointment(row as unknown as AppointmentJoinRow)

    await this.recordStatusChange(clinicId, appointmentId, {
      from: current?.status ?? null,
      to: 'canceled',
      by: canceledBy,
      reason,
    })

    return appointment
  }

  /**
   * O profissional já tem atendimento neste intervalo? — feature **A-02**.
   *
   * # A condição de sobreposição
   *
   * `existente.starts_at < novo.ends_at AND existente.ends_at > novo.starts_at`.
   * Os sinais são estritos porque o intervalo é semiaberto: um atendimento das
   * 10:00 às 10:30 e outro das 10:30 às 11:00 se encostam e **não** conflitam —
   * é exatamente como uma agenda de 30 em 30 minutos funciona.
   *
   * # O que esta checagem NÃO garante
   *
   * Ela lê e depois escreve, em duas idas ao banco, sem transação — o PostgREST
   * não expõe uma. Duas recepcionistas clicando no mesmo instante podem passar
   * as duas pela leitura e gravar as duas. A janela é de milissegundos, e a
   * correção definitiva é uma constraint de exclusão no Postgres, que recusa a
   * segunda escrita independentemente de quem leu o quê. A migration está
   * proposta em `supabase/migrations/20260808_appointments_no_overlap.sql` e
   * **não foi aplicada** (bloqueio B1).
   *
   * Enquanto isso: esta verificação cobre o caso real (pessoas diferentes
   * marcando em momentos diferentes) e `toWriteError` já traduz `23P01`/`23505`
   * para a mesma recusa — se a constraint existir, a corrida também é barrada,
   * e a mensagem que chega ao usuário é a mesma.
   */
  private async assertNoConflict(
    clinicId: string,
    professionalId: string,
    startsAt: Date,
    endsAt: Date,
    excludeAppointmentId?: string,
  ): Promise<void> {
    let query = this.client
      .from('appointments')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('professional_id', professionalId)
      .lt('starts_at', endsAt.toISOString())
      .gt('ends_at', startsAt.toISOString())
      .not('status', 'in', RELEASES_SLOT)
      .limit(1)

    // Remarcar para o MESMO horário não pode conflitar consigo mesmo.
    if (excludeAppointmentId) query = query.neq('id', excludeAppointmentId)

    const { data, error } = await query

    if (error) throw toWriteError(error)

    if (data && data.length > 0) {
      throw new AppointmentRepositoryError(
        'conflict',
        `sobreposicao com atendimento existente do profissional ${professionalId}`,
      )
    }
  }

  /**
   * O horário cabe no expediente declarado? — feature **A-02**.
   *
   * # Só o que a clínica configurou é imposto
   *
   * `parseStoredBusinessHours` devolve `source`, e apenas `'stored'` bloqueia.
   * Clínica que nunca abriu a tela de configurações continua marcando a qualquer
   * hora — o padrão de segunda a sexta, 08h às 18h, é sugestão de tela, e impor
   * uma sugestão recusaria o agendamento de domingo de uma clínica que atende
   * domingo e nunca disse o contrário.
   *
   * # E a recusa é reversível
   *
   * Fora do expediente NÃO é erro: é exceção. Encaixe às 19h acontece, e barrá-lo
   * de vez faria a recepção registrar 17h para conseguir marcar — o que destrói
   * a informação que a agenda existe para guardar. Quem confirma segue adiante,
   * e a confirmação vai para a auditoria.
   *
   * Falha de leitura da configuração **libera**: preferência indisponível não
   * pode virar clínica que não consegue agendar.
   */
  private async assertWithinBusinessHours(
    clinicId: string,
    startsAt: Date,
    endsAt: Date,
    options: ScheduleWriteOptions,
  ): Promise<void> {
    if (options.allowOutsideBusinessHours) return

    const { data, error } = await this.client
      .from('clinic_settings')
      .select('business_hours')
      .eq('clinic_id', clinicId)
      .maybeSingle()

    if (error) {
      console.error('[scheduling] horario de funcionamento indisponivel', {
        code: error.code ?? null,
      })
      return
    }

    const hours = parseStoredBusinessHours(data?.business_hours)
    if (hours.source !== 'stored') return

    const verdict = findOutsideBusinessHours(hours.value, startsAt, endsAt)
    if (!verdict) return

    throw new AppointmentRepositoryError(
      'outside-business-hours',
      `fora do expediente (${verdict.reason})`,
      undefined,
      describeOutsideHours(verdict),
    )
  }

  /**
   * Trilha de status em `appointment_status_history`.
   *
   * **Best-effort, e deliberadamente.** O atendimento JA foi criado ou
   * cancelado quando isto roda; falhar aqui e desfazer a operacao seria trocar
   * um registro de histórico ausente por uma agenda errada. O sinal fica no log
   * do servidor.
   *
   * E a mesma escolha do `recordAuditEvent`, e pelo mesmo motivo — com uma
   * diferenca: este historico e operacional (a recepcao consulta), enquanto o
   * `audit_log` e de conformidade.
   */
  private async recordStatusChange(
    clinicId: string,
    appointmentId: string,
    change: {
      from: AppointmentStatus | null
      to: AppointmentStatus
      by: string
      reason: string | null
    },
  ): Promise<void> {
    const { error } = await this.client
      .from('appointment_status_history')
      .insert({
        clinic_id: clinicId,
        appointment_id: appointmentId,
        from_status: change.from,
        to_status: change.to,
        changed_by: change.by,
        reason: change.reason,
        // Obrigatorio no `Insert` gerado: a coluna nao tem default no schema
        // remoto. Mesma regra do resto do projeto — nenhum default de banco e
        // presumido; o que a coluna exige, o insert manda.
        changed_at: new Date().toISOString(),
      })

    if (error) {
      console.error('[scheduling] recordStatusChange', {
        appointmentId,
        code: error.code ?? null,
        message: error.message ?? null,
      })
    }
  }
}

/**
 * Zero linhas afetadas.
 *
 * Pode ser id inexistente, atendimento ja cancelado, ou atendimento de OUTRA
 * clinica — a RLS filtra antes de o `update` ver a linha. Os tres devolvem a
 * mesma coisa de proposito: distinguir "nao existe" de "existe, mas nao e seu"
 * entregaria ao chamador a informacao de que aquele id existe em algum tenant.
 */
function notFound(appointmentId: string): AppointmentRepositoryError {
  return new AppointmentRepositoryError(
    'not-found',
    `nenhuma linha afetada para o atendimento ${appointmentId} na clinica ativa`,
  )
}

/**
 * Traduz a recusa do Postgres para o vocabulario do dominio.
 *
 * A mensagem que sobe daqui e para o LOG DO SERVIDOR — a action nunca a repassa
 * para a tela.
 */
function toWriteError(error: {
  code?: string | null
  message?: string | null
}): AppointmentRepositoryError {
  const code = error.code ?? undefined
  const message = error.message ?? 'sem mensagem'

  /*
   * `23P01` cobre DUAS constraints de exclusao, e elas pedem mensagens
   * diferentes.
   *
   *  - `appointments_no_overlap` — o PROFISSIONAL ja tem atendimento no
   *    intervalo. Desde A-02 isso e detectado ANTES da escrita, por consulta;
   *    este ramo e a ultima linha, para a corrida entre duas escritas
   *    simultaneas.
   *  - `appointments_room_no_overlap` — a SALA esta ocupada. Aqui NAO ha
   *    consulta previa: quem decide e o banco, no momento do insert.
   *
   * Distinguir importa porque a acao que resolve e outra. "Este profissional ja
   * tem atendimento nesse horario" manda trocar de horario; a sala ocupada se
   * resolve trocando de SALA, e o horario continua bom. Colapsar as duas faria
   * a recepcao remarcar a consulta inteira para um problema que um `select`
   * resolveria.
   *
   * O nome da constraint vem no `message` do Postgres. Se ele nao vier — driver
   * diferente, versao futura —, cai no `conflict` generico, que e a resposta
   * mais antiga e ainda correta.
   */
  if (code === '23P01' && /appointments_room_no_overlap/i.test(message)) {
    return new AppointmentRepositoryError('room-conflict', message, code)
  }

  if (code === '23P01' || code === '23505') {
    return new AppointmentRepositoryError('conflict', message, code)
  }

  // 23503 = foreign_key_violation: paciente ou profissional que nao existe
  // nesta clinica. Para quem agendou, e o mesmo que "nao encontrado".
  if (code === '23503') {
    return new AppointmentRepositoryError('not-found', message, code)
  }

  if (code === '42501' || code === 'PGRST301') {
    return new AppointmentRepositoryError('forbidden', message, code)
  }

  if (!code && /fetch|network|timeout|econnre/i.test(message)) {
    return new AppointmentRepositoryError('unavailable', message)
  }

  return new AppointmentRepositoryError('unexpected', message, code)
}
