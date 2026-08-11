import type { Appointment, Professional } from '@/modules/_shared/domain/types'

import type { AppointmentOutcome } from './AppointmentLifecycle'

/**
 * Dados de um agendamento novo, já normalizados pela camada de aplicação.
 *
 * O que NÃO está aqui importa tanto quanto o que está:
 *
 *  - **`clinicId` e `createdBy` não são campos.** Chegam como parâmetros
 *    próprios, vindos do `ActionContext` (P3 de `01-arquitetura.md`).
 *  - **Não há `durationMinutes`.** O banco guarda `starts_at`/`ends_at`; a
 *    duração é forma de exibição, e converter uma vez, no servidor, evita que
 *    dois lugares discordem sobre quando o atendimento termina.
 */
export interface NewAppointmentData {
  patientId: string
  professionalId: string
  startsAt: Date
  endsAt: Date
  /** `appointments.reason` — o que a recepção digitou como tipo. */
  reason: string
  /** Só os dois estados que fazem sentido ao criar. */
  status: 'scheduled' | 'confirmed'
  /** Observação interna, ou null. Não é dado clínico. */
  notes: string | null
  /**
   * Sala reservada, ou null.
   *
   * `null` é o padrão e continua sendo o caminho normal: a clínica que não
   * controla sala marca como sempre. Quem escolhe uma passa a disputar o
   * intervalo daquela sala com os outros atendimentos — e quem decide isso é a
   * constraint `appointments_room_no_overlap`, no banco, e não uma consulta
   * daqui.
   *
   * **Opcional na assinatura**, e não `string | null` obrigatório: ausência e
   * `null` significam a mesma coisa aqui — sem sala —, e exigir a chave faria
   * todo chamador antigo declarar um campo que ele não tem opinião sobre.
   */
  roomId?: string | null
}

/**
 * Ajustes da escrita que NÃO são dados do atendimento — feature **A-02**.
 *
 * Vive separado de `NewAppointmentData` de propósito: uma confirmação é sobre a
 * decisão de quem agenda, não sobre a consulta. Misturá-la com os campos
 * gravados faria parecer que "fora do expediente" é atributo da linha.
 */
export interface ScheduleWriteOptions {
  /**
   * Quem agenda já foi avisado de que o horário está fora do expediente e
   * confirmou mesmo assim.
   *
   * **Não é permissão** — quem chega aqui já passou por `appointment.write`. É
   * o registro de uma exceção deliberada, e por isso vai para a auditoria.
   */
  allowOutsideBusinessHours?: boolean
}

/** PORTA do modulo de agenda. */
export interface AppointmentRepository {
  /** Atendimentos ativos encontrados pelo nome do paciente. */
  searchByPatientName(
    clinicId: string,
    query: string,
    limit: number,
  ): Promise<Appointment[]>

  /**
   * Atendimentos de um intervalo [from, to).
   *
   * `withRoom` pede a sala no mesmo `select`. **Temporário**: enquanto
   * `20260809_rooms.sql` não for aplicada, `appointments.room_id` não existe, e
   * pedir uma coluna inexistente faz o PostgREST recusar a consulta inteira —
   * a agenda pararia de carregar por causa de um recurso que ninguém usa ainda.
   *
   * Quem chama já sabe a resposta: a rota carrega as salas antes e passa
   * `withRoom` só quando há alguma. Aplicada a migration, o parâmetro perde a
   * razão de existir.
   */
  listByRange(
    clinicId: string,
    from: Date,
    to: Date,
    options?: { withRoom?: boolean },
  ): Promise<Appointment[]>

  /**
   * Atendimentos de UM profissional no intervalo [from, to).
   *
   * Existe separado de `listByRange` em vez de virar um parâmetro opcional
   * porque o filtro precisa acontecer **no banco**. Carregar a agenda inteira
   * da clínica e filtrar em memória entregaria ao portal de um profissional a
   * lista de pacientes de todos os outros — pelo payload, mesmo que a tela
   * mostrasse só os dele.
   *
   * `professionalId` é `professionals.id`, e não o id de usuário: sai de
   * `current_professional_id()`, a mesma função que as policies consultam.
   * Recepção e financeiro não têm linha em `professionals`, então para eles a
   * resposta é uma lista vazia — que é o correto, e não um erro.
   */
  listByProfessionalRange(
    clinicId: string,
    professionalId: string,
    from: Date,
    to: Date,
  ): Promise<Appointment[]>

  listByPatient(clinicId: string, patientId: string): Promise<Appointment[]>

  listProfessionals(clinicId: string): Promise<Professional[]>

  /**
   * Cria o atendimento e devolve a entidade já mapeada.
   *
   * Falha esperada (horário ocupado, recusa de policy) sai como
   * `AppointmentRepositoryError` — a action a traduz em `Result`.
   *
   * Desde **A-02**, duas verificações acontecem ANTES da escrita: sobreposição
   * com outro atendimento do mesmo profissional (recusa dura) e horário fora do
   * expediente declarado (recusa que `options` reverte).
   */
  create(
    clinicId: string,
    data: NewAppointmentData,
    createdBy: string,
    options?: ScheduleWriteOptions,
  ): Promise<Appointment>

  /**
   * Move o atendimento para outro horário.
   *
   * Remarcar **não** muda status: um atendimento confirmado que muda de hora
   * continua confirmado. Tratar remarcação como novo agendamento perderia a
   * confirmação que o paciente já deu.
   */
  reschedule(
    clinicId: string,
    appointmentId: string,
    startsAt: Date,
    endsAt: Date,
    options?: ScheduleWriteOptions,
  ): Promise<Appointment>

  /**
   * Cancela o atendimento.
   *
   * Cancelar NÃO apaga: a linha continua, com `status = 'canceled'`,
   * `canceled_at` e o motivo. Agenda de saúde é registro do que foi combinado,
   * inclusive do que foi desmarcado — e o §8 do roadmap proíbe `DELETE` de
   * qualquer forma.
   */
  cancel(
    clinicId: string,
    appointmentId: string,
    reason: string | null,
    canceledBy: string,
  ): Promise<Appointment>

  /**
   * Confirma o atendimento — feature **A-03**.
   *
   * Sai de `scheduled` e carimba `confirmed_at`. A coluna existia desde o
   * princípio e nunca era escrita: dava para nascer confirmado, nunca para
   * confirmar depois — o avesso da rotina, em que se marca hoje e confirma na
   * véspera.
   *
   * A condição de origem vai no `WHERE`, não numa leitura anterior: entre ler o
   * status e gravar o novo cabe o clique de outra pessoa.
   */
  confirm(
    clinicId: string,
    appointmentId: string,
    confirmedBy: string,
  ): Promise<Appointment>

  /**
   * Registra o desfecho: veio (`completed`) ou não veio (`no_show`).
   *
   * É o par que alimenta a taxa de comparecimento de `/indicadores` e
   * `/relatorios` — que era nula porque nenhum dos dois valores tinha caminho
   * de escrita. `no_show` também devolve o horário à agenda: o banco já conta
   * falta como vaga livre.
   *
   * Recusa desfecho antes de `starts_at`: registro de falta é observação, e
   * antes da hora não há o que observar.
   */
  recordOutcome(
    clinicId: string,
    appointmentId: string,
    outcome: AppointmentOutcome,
    recordedBy: string,
  ): Promise<Appointment>
}
