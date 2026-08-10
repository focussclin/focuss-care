import type {
  AvailabilityException,
  NewAvailabilityExceptionData,
} from './AvailabilityException'

export type AvailabilityExceptionErrorReason =
  | 'forbidden'
  /**
   * A exceção é legível, mas a escrita não alcançou a linha.
   *
   * Sem policy de INSERT/DELETE em `availability_exceptions` para o papel, o
   * Postgres não devolve erro: zero linhas mudam, em silêncio.
   */
  | 'write-forbidden'
  | 'not-found'
  | 'unavailable'
  | 'unexpected'

export class AvailabilityExceptionError extends Error {
  constructor(
    readonly reason: AvailabilityExceptionErrorReason,
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'AvailabilityExceptionError'
  }
}

export function isAvailabilityExceptionError(
  cause: unknown,
): cause is AvailabilityExceptionError {
  return cause instanceof AvailabilityExceptionError
}

export interface AvailabilityExceptionRepository {
  /** Exceções que terminam a partir de `from` — o passado não muda decisão. */
  listUpcoming(clinicId: string, from: Date): Promise<AvailabilityException[]>
  /**
   * Atendimentos já marcados dentro da janela, para quem a exceção alcança.
   *
   * Um bloqueio criado por cima de agenda cheia não move os atendimentos: eles
   * continuam lá, agora dentro de uma janela que diz estar fechada. Quem cria
   * precisa saber disso ANTES, e é a única checagem que exige olhar
   * `appointments` de dentro desta superfície.
   */
  countAppointmentsIn(
    clinicId: string,
    startsAt: Date,
    endsAt: Date,
    professionalId: string | null,
  ): Promise<number>
  create(
    clinicId: string,
    createdBy: string,
    data: NewAvailabilityExceptionData,
  ): Promise<AvailabilityException>
  remove(clinicId: string, exceptionId: string): Promise<void>
}
