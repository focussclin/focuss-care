import type { Appointment, Professional } from '@/modules/_shared/domain/types'

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
}

/** PORTA do modulo de agenda. */
export interface AppointmentRepository {
  /** Atendimentos de um intervalo [from, to). */
  listByRange(clinicId: string, from: Date, to: Date): Promise<Appointment[]>

  listByPatient(clinicId: string, patientId: string): Promise<Appointment[]>

  listProfessionals(clinicId: string): Promise<Professional[]>

  /**
   * Cria o atendimento e devolve a entidade já mapeada.
   *
   * Falha esperada (horário ocupado, recusa de policy) sai como
   * `AppointmentRepositoryError` — a action a traduz em `Result`.
   */
  create(
    clinicId: string,
    data: NewAppointmentData,
    createdBy: string,
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
}
