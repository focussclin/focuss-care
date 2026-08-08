import 'server-only'

import { createHash } from 'node:crypto'

import type { PatientListQuery } from '../domain/PatientRepository'
import { PATIENT_CURSOR_MAX_LENGTH } from '../schemas/patientQuery.schema'

/**
 * Cursor da listagem de pacientes — ponteiro OPACO, por ANCORA, e sem PII.
 *
 * Duas regras duras, e nenhuma das duas e estetica:
 *
 *  1. **O cursor nunca carrega o nome do paciente.** Ele vive na URL: historico
 *     do navegador, header `Referer`, log de proxy e CDN, print de tela. Nome de
 *     paciente de uma clinica e dado pessoal em contexto de saude, e o cursor
 *     "obvio" — `base64(full_name + '|' + id)` — vaza exatamente isso.
 *  2. **O cursor nunca carrega `clinic_id`.** A clinica sai da sessao
 *     (`current_clinic_id()`); um `clinic_id` vindo do cliente e um `clinicId`
 *     do cliente com outro nome — o P3 de docs/01-arquitetura.md.
 *
 * O que sobra e um ponteiro para a linha ONDE PARAR: `{ v, a, f }`. Ele nao tem
 * autoridade nenhuma — quem resolve `a` em `(full_name, id)` e uma consulta
 * filtrada por `clinic_id` e `deleted_at is null`, sob RLS. Um cursor forjado
 * com o uuid de um paciente de OUTRA clinica simplesmente nao acha ancora, e a
 * listagem volta para a primeira pagina do proprio tenant. Por isso nao ha HMAC:
 * assinar protege dados com autoridade, e aqui nenhum dado tem.
 */

/** Sobe quando o formato mudar. Cursor de versao desconhecida e ignorado. */
const CURSOR_VERSION = 1

const CURSOR_KEYS = ['v', 'a', 'f'] as const

const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/
const UUID_PATTERN =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
const FINGERPRINT_PATTERN = /^[0-9a-f]{8}$/

export interface PatientCursor {
  /** Versao do formato. */
  v: number
  /** **A**ncora: o `patients.id` da ultima linha da pagina anterior. */
  a: string
  /** **F**ingerprint dos filtros que produziram a pagina anterior. */
  f: string
}

/**
 * Impressao digital do recorte (`status` + termo de busca).
 *
 * Existe para impedir que o cursor da busca "ana" seja aplicado a busca "bruno"
 * e devolva uma pagina silenciosamente errada — o usuario veria um resultado
 * plausivel comecando no meio. Nao bateu, ignora o cursor.
 *
 * Nao e segredo e nao precisa ser: o termo ja esta na URL, em `?q=`. O hash so
 * detecta divergencia.
 */
export function patientQueryFingerprint(
  query: Pick<PatientListQuery, 'search' | 'status'>,
): string {
  return createHash('sha256')
    .update(`${query.status}|${query.search ?? ''}`, 'utf8')
    .digest('hex')
    .slice(0, 8)
}

export function encodePatientCursor(
  anchorId: string,
  fingerprint: string,
): string {
  const payload: PatientCursor = {
    v: CURSOR_VERSION,
    a: anchorId,
    f: fingerprint,
  }

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

/**
 * Cursor cru -> ponteiro validado, ou `null`. **Nunca lanca.**
 *
 * `null` significa sempre a mesma coisa para quem chama: sirva a primeira
 * pagina. Base64 quebrado, JSON invalido, versao desconhecida, chave a mais,
 * uuid mal formado — tudo cai no mesmo lugar, porque para o usuario o resultado
 * correto de "cursor que nao vale" e uma lista do inicio, nao um erro.
 */
export function decodePatientCursor(
  raw: string | null | undefined,
): PatientCursor | null {
  if (typeof raw !== 'string') return null
  if (raw.length === 0 || raw.length > PATIENT_CURSOR_MAX_LENGTH) return null

  // `Buffer.from(x, 'base64url')` ignora caractere invalido em vez de recusar:
  // sem esta checagem, lixo com pontuacao viraria bytes "quase validos".
  if (!BASE64URL_PATTERN.test(raw)) return null

  let parsed: unknown

  try {
    parsed = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))
  } catch {
    return null
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return null
  }

  // Conjunto EXATO de chaves. Um cursor com campo a mais nao e um cursor novo:
  // e alguem tentando fazer o servidor ler algo que este formato nao promete —
  // e o teste que quebra no dia em que um `full_name` for acrescentado aqui.
  const keys = Object.keys(parsed)
  if (
    keys.length !== CURSOR_KEYS.length ||
    !CURSOR_KEYS.every((key) => keys.includes(key))
  ) {
    return null
  }

  const { v, a, f } = parsed as Record<string, unknown>

  if (v !== CURSOR_VERSION) return null
  if (typeof a !== 'string' || !UUID_PATTERN.test(a)) return null
  if (typeof f !== 'string' || !FINGERPRINT_PATTERN.test(f)) return null

  return { v: CURSOR_VERSION, a, f }
}
