import 'server-only'

/**
 * Descreve uma falha para o LOG DO SERVIDOR — nunca para a tela.
 *
 * Existe porque a assimetria entre os dois destinos estava invertida: o retorno
 * da Server Action era generico (correto) e o log tambem (errado). Um log que so
 * guarda `{ code: 'unknown' }` nao diagnostica incidente nenhum.
 *
 * O que vai para o usuario continua sendo `AppError.message`, em pt-BR e sem
 * detalhe de banco. O que vai para o servidor e tudo: um `PostgrestError` traz
 * `code`, `details` e `hint`, e sao exatamente esses tres campos que dizem qual
 * policy ou constraint recusou a escrita.
 *
 * `PostgrestError` NAO e `instanceof Error`, entao a checagem por `instanceof`
 * sozinha descartava toda falha vinda do Supabase.
 */
export interface CauseDescription {
  kind: 'error' | 'postgrest' | 'value'
  name?: string
  code?: string
  message?: string
  details?: string
  hint?: string
  status?: number
  stack?: string
}

function readString(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function describeCause(cause: unknown): CauseDescription {
  if (cause instanceof Error) {
    const extra = cause as unknown as Record<string, unknown>
    return {
      kind: 'error',
      name: cause.name,
      message: cause.message,
      code: readString(extra, 'code'),
      stack: cause.stack,
    }
  }

  if (typeof cause === 'object' && cause !== null) {
    const source = cause as Record<string, unknown>
    const status = source.status

    return {
      kind: 'postgrest',
      code: readString(source, 'code'),
      message: readString(source, 'message'),
      details: readString(source, 'details'),
      hint: readString(source, 'hint'),
      status: typeof status === 'number' ? status : undefined,
    }
  }

  return { kind: 'value', message: String(cause) }
}
