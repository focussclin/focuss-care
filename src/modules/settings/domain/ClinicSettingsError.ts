/**
 * Falha de escrita das configurações, traduzida para o domínio.
 */
export type SettingsWriteFailure =
  /** A clínica não existe, está arquivada, ou é de outro tenant. */
  | 'not-found'
  /**
   * Já existe outra clínica com este CNPJ.
   *
   * O único campo deste formulário com cara de chave única é o CNPJ — nome
   * fantasia e razão social se repetem legitimamente entre clínicas.
   */
  | 'duplicate'
  /** A policy de RLS recusou. */
  | 'forbidden'
  /** O banco não respondeu. */
  | 'unavailable'
  /** Qualquer outra recusa. */
  | 'unexpected'

export class ClinicSettingsError extends Error {
  readonly reason: SettingsWriteFailure
  readonly code?: string

  constructor(reason: SettingsWriteFailure, message: string, code?: string) {
    super(message)
    this.name = 'ClinicSettingsError'
    this.reason = reason
    this.code = code
  }
}

export function isClinicSettingsError(
  cause: unknown,
): cause is ClinicSettingsError {
  return cause instanceof ClinicSettingsError
}
