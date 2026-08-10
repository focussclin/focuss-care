/**
 * As razões pelas quais um vínculo de portal pode não acontecer.
 *
 * A lista é longa de propósito, e cada entrada existe porque a **ação que
 * resolve** é diferente:
 *
 *  - `invite-expired` → peça um convite novo à clínica;
 *  - `invite-used` → você já tem acesso, entre pelo login;
 *  - `invite-revoked` → fale com a clínica, alguém cancelou;
 *  - `email-mismatch` → entre com o e-mail que recebeu o convite;
 *  - `already-linked` → este paciente já tem portal.
 *
 * Colapsá-las em "convite inválido" transformaria cinco caminhos de saída num
 * beco. É o oposto do que se quer numa tela que a pessoa abre uma vez na vida,
 * sozinha, sem ninguém do lado para explicar.
 */
export type PatientPortalFailure =
  | 'not-found'
  | 'forbidden'
  | 'invite-expired'
  | 'invite-used'
  | 'invite-revoked'
  | 'email-mismatch'
  | 'already-linked'
  | 'invalid-email'
  | 'not-authenticated'
  | 'schema-not-ready'
  | 'unavailable'
  | 'unexpected'

export class PatientPortalRepositoryError extends Error {
  readonly reason: PatientPortalFailure
  /** SQLSTATE ou código do driver. Log do servidor apenas. */
  readonly code?: string

  constructor(reason: PatientPortalFailure, message: string, code?: string) {
    super(message)
    this.name = 'PatientPortalRepositoryError'
    this.reason = reason
    this.code = code
  }
}

export function isPatientPortalRepositoryError(
  cause: unknown,
): cause is PatientPortalRepositoryError {
  return cause instanceof PatientPortalRepositoryError
}

/**
 * Traduz a recusa do banco.
 *
 * O SQLSTATE sozinho não basta: `42501` cobre tanto "você não tem permissão"
 * quanto "o e-mail da sessão não é o do convite", e `22023` cobre os três
 * estados de convite que não servem. A mensagem que a função levanta é o que
 * separa — por isso as funções da migration usam nomes em caixa alta
 * (`EMAIL_MISMATCH`, `INVITE_USED`) em vez de texto livre.
 */
export function toPatientPortalError(cause: {
  code?: string | null
  message?: string | null
}): PatientPortalRepositoryError {
  const code = cause.code ?? undefined
  const message = cause.message ?? ''

  if (message.includes('EMAIL_MISMATCH')) {
    return new PatientPortalRepositoryError(
      'email-mismatch',
      'a sessão não corresponde ao e-mail do convite',
      code,
    )
  }

  if (message.includes('INVITE_EXPIRED')) {
    return new PatientPortalRepositoryError(
      'invite-expired',
      'convite expirado',
      code,
    )
  }

  if (message.includes('INVITE_USED')) {
    return new PatientPortalRepositoryError(
      'invite-used',
      'convite já utilizado',
      code,
    )
  }

  if (message.includes('INVITE_REVOKED')) {
    return new PatientPortalRepositoryError(
      'invite-revoked',
      'convite revogado',
      code,
    )
  }

  if (message.includes('ALREADY_LINKED')) {
    return new PatientPortalRepositoryError(
      'already-linked',
      'este paciente já tem acesso ao portal',
      code,
    )
  }

  if (message.includes('INVALID_EMAIL') || message.includes('INVALID_EXPIRY')) {
    return new PatientPortalRepositoryError(
      'invalid-email',
      'dados do convite inválidos',
      code,
    )
  }

  if (
    message.includes('NOT_AUTHENTICATED') ||
    message.includes('NO_SESSION_EMAIL')
  ) {
    return new PatientPortalRepositoryError(
      'not-authenticated',
      'sessão ausente',
      code,
    )
  }

  if (message.includes('PATIENT_NOT_FOUND') || message.includes('INVITE_NOT_FOUND')) {
    return new PatientPortalRepositoryError('not-found', 'não encontrado', code)
  }

  /*
   * `42883` (função inexistente) e `PGRST202` (função fora do cache do
   * PostgREST) são o equivalente, para RPC, do `42P01` de tabela: a migration
   * não foi aplicada. Distinto de `unavailable`, que pede "tente de novo".
   */
  if (code === '42883' || code === 'PGRST202' || code === '42P01' || code === 'PGRST205') {
    return new PatientPortalRepositoryError(
      'schema-not-ready',
      'portal do paciente ainda não está disponível no banco',
      code,
    )
  }

  if (code === '42501') {
    return new PatientPortalRepositoryError(
      'forbidden',
      'sem permissão para esta operação',
      code,
    )
  }

  if (code === 'P0002') {
    return new PatientPortalRepositoryError('not-found', 'não encontrado', code)
  }

  if (code === '23505') {
    return new PatientPortalRepositoryError(
      'already-linked',
      'este paciente já tem acesso ao portal',
      code,
    )
  }

  if (code === 'PGRST301' || code === '08006' || code === '57P01') {
    return new PatientPortalRepositoryError(
      'unavailable',
      'serviço indisponível no momento',
      code,
    )
  }

  return new PatientPortalRepositoryError(
    'unexpected',
    'falha inesperada no portal do paciente',
    code,
  )
}
