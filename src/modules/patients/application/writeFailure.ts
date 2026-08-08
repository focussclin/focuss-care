import 'server-only'

import { unstable_rethrow } from 'next/navigation'

import { err, type ActionResult } from '@/modules/_shared/domain/Result'

import { isPatientRepositoryError } from '../domain/PatientRepositoryError'

/**
 * Falha de escrita -> `Result` com mensagem em pt-BR.
 *
 * Um lugar so para as tres actions do modulo, porque a parte que importa aqui nao
 * e o `switch`: e a regra sobre o que vai para o log.
 *
 * **O log recebe apenas `reason`, `code` e `status`** — deliberadamente menos que
 * o `describeCause` usado nas outras actions do projeto. A diferenca e a tabela:
 * em `patients`, o `details` de uma unique violation ecoa o valor enviado
 * (`Key (clinic_id, cpf)=(…, 000…) already exists`). O texto do erro do Postgres
 * pode, portanto, carregar dado pessoal do paciente para dentro do log — que e
 * lido por muito mais gente do que a tabela. Codigo e status bastam para saber
 * qual classe de recusa ocorreu.
 */
export interface WriteFailureMessages {
  conflict: string
  forbidden: string
  notFound: string
  unavailable: string
  unexpected: string
}

export function toWriteFailure<F extends string>(
  action: string,
  cause: unknown,
  messages: WriteFailureMessages,
): ActionResult<never, F> {
  // redirect()/notFound() do Next sinalizam por excecao: devolve-los ao framework
  // antes de tratar qualquer coisa como falha de banco.
  unstable_rethrow(cause)

  if (isPatientRepositoryError(cause)) {
    console.error(`[${action}] escrita recusada`, {
      reason: cause.reason,
      code: cause.code,
    })

    switch (cause.reason) {
      case 'conflict':
        return err<F>('conflict', messages.conflict)
      case 'not-found':
        return err<F>('not-found', messages.notFound)
      case 'forbidden':
        return err<F>('forbidden', messages.forbidden)
      case 'unavailable':
        return err<F>('unavailable', messages.unavailable)
      case 'unexpected':
        return err<F>('unexpected', messages.unexpected)
    }
  }

  console.error(`[${action}] falha nao tratada`, failureSignal(cause))
  return err<F>('unexpected', messages.unexpected)
}

/**
 * Mantem detalhes de PostgREST fora do log, mas preserva diagnostico para erros
 * normais do runtime (TypeError, falha de conversao etc.).
 */
function failureSignal(cause: unknown): {
  kind?: 'error' | 'external' | 'value'
  name?: string
  message?: string
  stack?: string
  code?: string
  status?: number
} {
  if (cause instanceof Error) {
    return {
      kind: 'error',
      name: cause.name,
      message: cause.message,
      stack: cause.stack,
    }
  }

  if (typeof cause !== 'object' || cause === null) {
    return { kind: 'value' }
  }

  const source = cause as Record<string, unknown>
  return {
    kind: 'external',
    code: typeof source.code === 'string' ? source.code : undefined,
    status: typeof source.status === 'number' ? source.status : undefined,
  }
}
