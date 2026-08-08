import 'server-only'

import { isIP } from 'node:net'

import { headers } from 'next/headers'
import { unstable_rethrow } from 'next/navigation'

import { describeCause } from '@/lib/observability/describe-cause'
import type { Database, Json } from '@/lib/supabase/database.types'
import { createSupabaseServerClient } from '@/lib/supabase/server'

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Escrita em `audit_log`.
 *
 * Tres decisoes sustentam este arquivo:
 *
 *  1. **Quem agiu nao e parametro.** `actor_user_id`, `clinic_id` e `actor_role`
 *     saem sempre da sessao e das claims do JWT — `auth.getUser()`,
 *     `current_clinic_id()` e `current_clinic_role()`. A funcao nao aceita esses
 *     valores de fora, entao nao ha assinatura possivel em que um chamador
 *     (muito menos o cliente) audite um evento em nome de outra pessoa ou de
 *     outra clinica. E a mesma regra do P3 de docs/01-arquitetura.md, aplicada ao
 *     log.
 *
 *  2. **Cliente com a sessao do usuario, nunca `SUPABASE_SECRET_KEY`.** O insert
 *     passa pelas policies de RLS como qualquer outra escrita. O log herda o
 *     isolamento entre clinicas em vez de precisar reimplementa-lo.
 *
 *  3. **Best-effort, e falha em silencio para o usuario.** Auditoria e requisito
 *     legal, mas nao pode derrubar a operacao que ela observa — principalmente
 *     porque a policy de INSERT de `audit_log` no projeto remoto ainda NAO foi
 *     verificada (ver docs/06-acoes-e-auditoria.md, secao "Pendencias"). Toda
 *     falha vira `{ recorded: false, reason }` mais um log estruturado no
 *     servidor. Nada e lancado.
 *
 * O que NAO entra em `audit_log`: dado clinico, dado pessoal de paciente e
 * qualquer segredo. Ver `sanitizeMetadata` abaixo — a barreira e no codigo, nao
 * na disciplina de quem chama.
 */

/**
 * Metadados de um evento. So escalares: o log guarda O QUE mudou em termos
 * operacionais (slug, status, contagem), nunca o conteudo do registro.
 */
export type AuditMetadata = Record<string, string | number | boolean | null>

export interface AuditEvent {
  /**
   * Verbo do evento no formato `<entidade>.<acao>`: 'clinic.created',
   * 'patient.archived'. Vocabulario fechado por modulo, estavel ao longo do
   * tempo — e por ele que a consulta de auditoria filtra.
   */
  action: string
  /** Tipo da entidade tocada: 'clinic', 'patient', 'appointment'. */
  entityType: string
  /** Id da entidade, quando existe. */
  entityId?: string | null
  /** Estado anterior, resumido e nao sensivel. */
  before?: AuditMetadata | null
  /** Estado posterior, resumido e nao sensivel. */
  after?: AuditMetadata | null
}

export interface AuditOptions {
  /**
   * Cliente Supabase com a sessao do usuario.
   *
   * Existe para um caso especifico: quando a acao acabou de chamar
   * `auth.refreshSession()`, o cliente em maos ja tem o token novo em memoria,
   * enquanto um cliente criado do zero depende do cookie ja ter sido reescrito.
   * Passar o proprio cliente evita auditar com claims velhas.
   *
   * Nao afrouxa a regra 1: o ator continua sendo lido DA SESSAO desse cliente.
   */
  client?: SupabaseClient<Database>
}

export type AuditSkipReason =
  /** Supabase ausente do ambiente — a aplicacao esta em demonstracao local. */
  | 'not-configured'
  /** Sem sessao valida: nao ha ator a registrar. */
  | 'unauthenticated'
  /** Sessao sem clinica ativa nas claims — o insert seria recusado pela RLS. */
  | 'no-active-clinic'
  /** O banco recusou a escrita (policy, constraint, tipo de coluna). */
  | 'rejected'
  /** Falha nao classificada durante a escrita. */
  | 'unexpected'

export type AuditOutcome = { recorded: true } | { recorded: false; reason: AuditSkipReason }

/**
 * Registra um evento em `audit_log`. Nunca lanca.
 *
 * Devolve o desfecho para que o chamador possa decidir (hoje, nenhum chamador
 * decide nada: a operacao segue igual). O sinal util fica no log do servidor.
 */
export async function recordAuditEvent(
  event: AuditEvent,
  options: AuditOptions = {},
): Promise<AuditOutcome> {
  try {
    const supabase = options.client ?? (await createSupabaseServerClient())
    if (!supabase) return skip(event, 'not-configured')

    const { data: userData, error: userError } = await supabase.auth.getUser()
    const actorUserId = userData?.user?.id
    if (userError || !actorUserId) return skip(event, 'unauthenticated')

    // `current_clinic_id()` le as claims do JWT — a mesma fonte que as policies
    // consultam. Se ela devolve vazio, o insert seria recusado de qualquer forma.
    const { data: clinicId } = await supabase.rpc('current_clinic_id')
    if (!clinicId) return skip(event, 'no-active-clinic')

    const { data: role } = await supabase.rpc('current_clinic_role')

    const { ip, userAgent } = await readRequestSignals()

    const row = {
      clinic_id: clinicId,
      actor_user_id: actorUserId,
      actor_role: role ?? null,
      action: event.action,
      entity_type: event.entityType,
      entity_id: toEntityId(event),
      before: sanitizeMetadata(event.before, event, 'before'),
      after: sanitizeMetadata(event.after, event, 'after'),
      ip,
      user_agent: userAgent,
      occurred_at: new Date().toISOString(),
    }

    let { error } = await supabase.from('audit_log').insert(row)

    // 22P02 = invalid_text_representation. Se `ip` for `inet` e algum valor
    // escapar do parser, o evento inteiro se perderia por causa de um cabecalho
    // que o cliente controla — ou seja, o auditado apagaria o proprio rastro.
    // O IP e o campo mais dispensavel da linha: regrava sem ele.
    if (error?.code === '22P02' && ip) {
      console.warn('[audit] ip recusado pelo banco, regravando sem ip', {
        action: event.action,
        entityType: event.entityType,
      })
      ;({ error } = await supabase.from('audit_log').insert({ ...row, ip: null }))
    }

    if (error) {
      // O detalhe do banco fica AQUI, no log do servidor: `details` e `hint` sao
      // o que identifica qual policy ou constraint recusou (P-A1). Nada disso
      // atravessa a fronteira da Server Action — o usuario recebe so a mensagem
      // generica montada pelo chamador.
      console.error('[audit] escrita recusada', {
        action: event.action,
        entityType: event.entityType,
        ...describeCause(error),
      })
      return { recorded: false, reason: 'rejected' }
    }

    return { recorded: true }
  } catch (cause) {
    unstable_rethrow(cause)

    console.error('[audit] falha inesperada', {
      action: event.action,
      entityType: event.entityType,
      ...describeCause(cause),
    })
    return { recorded: false, reason: 'unexpected' }
  }
}

function skip(event: AuditEvent, reason: AuditSkipReason): AuditOutcome {
  // Aviso, nao erro: sao estados previstos do sistema, nao defeitos.
  console.warn('[audit] evento nao registrado', {
    action: event.action,
    entityType: event.entityType,
    reason,
  })
  return { recorded: false, reason }
}

// ---------------------------------------------------------------------------
// Sinais do request
// ---------------------------------------------------------------------------

/**
 * IP e user agent do request.
 *
 * O IP e dado pessoal (LGPD art. 5, I) e so existe aqui porque a auditoria de
 * acesso a dado de saude exige "quem, quando, de qual IP" — secao 9 de
 * docs/01-arquitetura.md. Nao circula fora de `audit_log`.
 */
async function readRequestSignals(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const headerList = await headers()
    // `x-real-ip` costuma ser sobrescrito pelo proxy. Na lista encadeada,
    // usamos o ultimo hop (mais proximo do servidor) em vez do primeiro valor,
    // que e o trecho mais facil de ser injetado pelo cliente. Como a topologia
    // do deploy ainda nao e configurada no codigo, a documentacao trata esse
    // campo como sinal declarado do request, nao como evidencia forense.
    const ip =
      normalizeIp(headerList.get('x-real-ip')) ?? normalizeForwardedFor(headerList.get('x-forwarded-for'))
    const userAgent = headerList.get('user-agent')

    return { ip, userAgent: userAgent ? userAgent.slice(0, 400) : null }
  } catch (cause) {
    unstable_rethrow(cause)

    // `headers()` fora de um request (job, script). O evento ainda vale sem eles.
    return { ip: null, userAgent: null }
  }
}

/**
 * Endereco de um cabecalho de proxy, validado estritamente.
 *
 * A validacao nao e cosmetica: se a coluna `ip` for `inet`, um valor invalido
 * (a lista inteira de `x-forwarded-for`, um host com porta) faz o insert falhar
 * e derruba o evento inteiro. Na duvida, grava null. A escolha do hop fica em
 * `normalizeForwardedFor`, para nao confundir o primeiro valor declarado pelo
 * cliente com um sinal confiavel do proxy.
 */
function normalizeIp(raw: string | null): string | null {
  if (!raw) return null

  let value = raw.trim()
  if (!value) return null

  const bracketed = value.match(/^\[([^\]]+)\](?::\d+)?$/)
  if (bracketed) value = bracketed[1]
  else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(value)) value = value.slice(0, value.lastIndexOf(':'))

  return isIP(value) ? value : null
}

function normalizeForwardedFor(raw: string | null): string | null {
  if (!raw) return null
  const hops = raw.split(',').map((value) => value.trim()).filter(Boolean)
  return normalizeIp(hops.at(-1) ?? null)
}

// ---------------------------------------------------------------------------
// Sanitizacao
// ---------------------------------------------------------------------------

/**
 * Chaves que nunca entram no log, por nome.
 *
 * Rede de seguranca, nao a defesa principal — a defesa principal e o chamador
 * mandar so metadado operacional. Mas "o chamador toma cuidado" nao e um
 * controle verificavel, e `audit_log` e uma tabela que a operacao inteira le.
 * Um CPF que vaze para ca vira dado pessoal em uma tabela append-only.
 */
const forbiddenKeyPatterns: readonly RegExp[] = [
  /senha|password|passwd/i,
  /secret|token|credential/i,
  /api[_-]?key|access[_-]?key|^key$/i,
  /authorization|cookie/i,
  /cpf|cnpj|^rg$|passaporte/i,
  /documento|identidade|matricula|carteirinha|^cns$|^crm$/i,
  /e?-?mail/i,
  /telefone|phone|celular|whatsapp/i,
  /nascimento|birth/i,
  /endereco|address|logradouro|^cep$/i,
  /nome|name/i,
  /paciente|patient|responsavel|contato|contact/i,
  /observac|anotac|^nota$|^note[s]?$|coment/i,
  /diagnost|anamnese|prescri|prontuario|laudo|alergia|medicamento|sintoma/i,
]

/** Limites que impedem o log de virar deposito de payload. */
/** `audit_log.entity_id` é `uuid` no banco — qualquer outra coisa é recusada. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** `true` quando o valor pode ir para a coluna `uuid` sem o Postgres recusar. */
export function isAuditEntityId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

/**
 * O id da entidade, ou `null` — nunca uma string que o banco vai recusar.
 *
 * # O defeito que isto conserta
 *
 * `/prontuarios` chamava `logAccess(clinicId, 'all')` para dizer "leu a lista,
 * não um paciente". Aquele `'all'` ia para `entity_id`, que é `uuid`, e o
 * Postgres recusava **a linha inteira** com `22P02`. Como a auditoria é
 * best-effort, o evento sumia sem quebrar tela nenhuma: a leitura do prontuário
 * simplesmente não era registrada, e ninguém saberia até alguém perguntar quem
 * abriu o prontuário de um paciente.
 *
 * A chamada foi corrigida para `null`. Esta função é a rede: um id malformado
 * passa a gravar o evento **sem** o id, em vez de perder o evento. Para uma
 * trilha exigida por lei, "quem, o quê e quando" vale mais que o id do alvo — e
 * o log do servidor diz o que foi descartado, para o defeito não voltar a ser
 * silencioso.
 */
function toEntityId(event: AuditEvent): string | null {
  if (event.entityId === null || event.entityId === undefined) return null
  if (isAuditEntityId(event.entityId)) return event.entityId

  console.error('[audit] entity_id ignorado por nao ser uuid', {
    action: event.action,
    entityType: event.entityType,
  })

  return null
}

const maxKeys = 20
const maxStringLength = 160

function sanitizeMetadata(
  metadata: AuditMetadata | null | undefined,
  event: AuditEvent,
  field: 'before' | 'after',
): Json | null {
  if (!metadata) return null

  const clean: Record<string, string | number | boolean | null> = {}
  const dropped: string[] = []
  let count = 0

  for (const [key, value] of Object.entries(metadata)) {
    if (count >= maxKeys) {
      dropped.push(key)
      continue
    }

    if (forbiddenKeyPatterns.some((pattern) => pattern.test(key))) {
      dropped.push(key)
      continue
    }

    if (value === null || typeof value === 'boolean') {
      clean[key] = value
    } else if (typeof value === 'number') {
      if (!Number.isFinite(value)) {
        dropped.push(key)
        continue
      }
      clean[key] = value
    } else if (typeof value === 'string') {
      clean[key] = value.slice(0, maxStringLength)
    } else {
      // Objeto, array, undefined: o tipo ja proibe, mas a entrada pode vir de
      // JS sem tipos. Descartar e mais seguro que serializar as cegas.
      dropped.push(key)
      continue
    }

    count += 1
  }

  if (dropped.length > 0) {
    // Descarte silencioso era pior que o descarte: o chamador achava que estava
    // auditando um campo que nunca chegou ao banco. So os NOMES das chaves sao
    // logados — o valor descartado e justamente o que nao pode circular.
    console.warn('[audit] metadado descartado', {
      action: event.action,
      entityType: event.entityType,
      field,
      keys: dropped,
    })
  }

  return count > 0 ? clean : null
}
