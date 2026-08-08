import 'server-only'

import { revalidatePath, updateTag } from 'next/cache'
import { unstable_rethrow } from 'next/navigation'
import { after } from 'next/server'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ZodType } from 'zod'

import { recordAuditEvent, type AuditEvent } from '@/lib/audit/audit-log'
import { getSessionState } from '@/lib/auth/session'
import type { CacheTag } from '@/lib/cache/tags'
import { describeCause } from '@/lib/observability/describe-cause'
import type { Database, MembershipRole } from '@/lib/supabase/database.types'
import { createSupabaseServerClient } from '@/lib/supabase/server'

import { err, type ActionResult, type AppErrorCode } from '../domain/Result'

/**
 * O pipeline unico de mutacao (P5 de docs/roadmap.md):
 *
 *   autenticar -> clinica ativa -> autorizar papel -> validar Zod
 *              -> use case -> revalidar -> auditar
 *
 * Enquanto toda escrita passar por aqui, nao ha como esquecer um passo de
 * seguranca: os quatro primeiros acontecem ANTES do handler receber qualquer
 * coisa, e o handler nem consegue ver a entrada crua.
 *
 * As tres regras que este arquivo impoe, e que sozinhas justificam a abstracao:
 *
 *  1. **`clinicId` e `userId` nunca vem do cliente.** Saem de
 *     `current_clinic_id()` e da sessao validada. O handler recebe os dois no
 *     contexto e nao tem motivo para aceita-los na entrada — se um schema
 *     declarar `clinicId`, a RLS ainda recusaria, mas o desenho ja evita a
 *     tentacao (P3 de docs/01-arquitetura.md).
 *  2. **O cliente Supabase do contexto carrega a sessao do usuario.** Nenhum
 *     caminho daqui alcanca `SUPABASE_SECRET_KEY`; toda escrita passa por RLS.
 *  3. **Erro esperado e valor, nao excecao.** O handler devolve `ActionResult`;
 *     excecao inesperada vira 'unexpected' com a causa so no log do servidor.
 *
 * ## O que este pipeline NAO cobre
 *
 * Acoes que rodam ANTES de existir clinica — `signUp`, `signIn` e
 * `createClinic`. Elas sao o bootstrap do tenant: exigir clinica ativa nelas
 * seria circular. Continuam escritas a mao, com validacao e mensagens proprias,
 * e auditam pelo `recordAuditEvent` diretamente. Ver
 * docs/06-acoes-e-auditoria.md.
 */

export interface ActionContext {
  /** Cliente com a sessao do usuario — RLS ativa em toda consulta. */
  supabase: SupabaseClient<Database>
  /** Clinica ativa, resolvida pelo banco. Nunca veio do cliente. */
  clinicId: string
  /** Papel na clinica ativa. Null quando as claims nao o trazem. */
  role: MembershipRole | null
  userId: string
}

/**
 * O que o callback de cache enxerga: **so o que o servidor decidiu**.
 *
 * Recorte deliberado de `ActionContext`. Nao ha `supabase` (montar tag nao e
 * consultar) e, principalmente, nao ha entrada do formulario — ver o JSDoc de
 * `cacheTags`.
 */
export interface ActionCacheScope {
  /** Clinica ativa, resolvida por `current_clinic_id()`. Nunca veio do cliente. */
  clinicId: string
  /** Usuario da sessao validada. Para tags de recorte pessoal, quando existirem. */
  userId: string
}

export interface CreateActionOptions<TInput, TOutput, F extends string = string> {
  /**
   * Nome estavel da acao, no formato `<entidade>.<verbo>`: 'patient.create'.
   * Aparece no log de erro do servidor e serve de rotulo unico no codigo.
   */
  name: string
  /** Contrato de entrada. Reaplicado no servidor mesmo que a UI ja tenha validado. */
  schema: ZodType<TInput>
  /**
   * Papeis autorizados. Omitido = qualquer membro com clinica ativa.
   * A RLS decide DE QUAL clinica; esta lista decide O QUE o papel pode fazer.
   */
  roles?: readonly MembershipRole[]
  /** Sobrescreve mensagens padrao por codigo, quando a feature tem texto proprio. */
  messages?: Partial<Record<AppErrorCode, string>>
  /**
   * O caso de uso. Recebe a entrada ja validada e o contexto ja autorizado.
   *
   * **Nao chame `redirect()` nem `notFound()` daqui de dentro.** Os dois
   * sinalizam por excecao: o pipeline devolve a excecao ao Next (passo 5) e,
   * com isso, os passos 6 e 7 nunca rodam — a escrita aconteceria sem
   * revalidacao e sem auditoria, que e exatamente o R4 do roadmap. Devolva
   * `ok(...)` e navegue no container, como faz OnboardingForm.container.
   */
  handler: (input: TInput, context: ActionContext) => Promise<ActionResult<TOutput, F>>
  /**
   * Tags de cache a invalidar apos sucesso (F-02 — divida D3 do roadmap).
   *
   * Duas restricoes de desenho, e as duas sao de seguranca:
   *
   *  1. **O callback nao recebe a entrada.** Ve `scope` (clinica e usuario, os
   *     dois derivados no servidor) e `output` (a linha que o caso de uso
   *     devolveu, ja depois da RLS). Nao ha por onde uma tag nascer de campo de
   *     formulario — se `input` chegasse aqui, o navegador escolheria qual
   *     recorte de cache expirar.
   *  2. **A tag e `CacheTag`, nao `string`.** So `lib/cache/tags.ts` produz esse
   *     tipo, e la toda tag carrega `clinic_id` (P4 do roadmap). Uma literal
   *     como `'patients'` nao compila aqui.
   *
   * Usa `updateTag`, e nao `revalidateTag`: quem acabou de salvar precisa ver o
   * proprio dado na leitura seguinte (read-your-own-writes), nao a versao velha
   * enquanto a nova carrega em segundo plano. `updateTag` so vale dentro de
   * Server Action — que e exatamente e unicamente o que esta fabrica monta.
   * Ver node_modules/next/dist/docs/01-app/03-api-reference/04-functions/updateTag.md.
   *
   * Hoje isto e cano sem agua: nenhuma leitura do produto usa `use cache` ainda,
   * entao invalidar e no-op. O cano existe montado e testado para que a primeira
   * leitura cacheavel tenant-scoped nao precise inventar a invalidacao junto.
   */
  cacheTags?: (scope: ActionCacheScope, output: TOutput) => readonly CacheTag[]
  /**
   * Caminhos a revalidar apos sucesso.
   *
   * Continua valendo, e nao foi substituido por `cacheTags`: os dois resolvem
   * problemas diferentes. `revalidatePath` derruba o cache de Router de uma rota
   * — que e o que faz a listagem de `/pacientes` reaparecer atualizada hoje, sem
   * nenhum `use cache` no caminho. Tag invalida entrada de `use cache`, que ainda
   * nao existe. Enquanto nao existir, remover daqui apagaria a revalidacao real.
   */
  revalidatePaths?: readonly string[]
  /**
   * Evento de auditoria do sucesso. Devolva null para nao auditar.
   *
   * Ator, clinica e papel NAO entram aqui — `recordAuditEvent` os deriva da
   * sessao. Este callback so descreve O QUE aconteceu.
   *
   * Roda dentro de `after()`, depois da resposta: nao adie nada que o usuario
   * precise ver, e conte que uma excecao aqui vai para o log, nao para a tela.
   */
  audit?: (output: TOutput, input: TInput) => AuditEvent | null
}

/** Textos genericos, em pt-BR, que nunca revelam detalhe de banco. */
const defaultMessages: Record<AppErrorCode, string> = {
  unauthenticated: 'Sua sessão expirou. Entre novamente para continuar.',
  'no-active-clinic': 'Sua conta ainda não está vinculada a uma clínica.',
  forbidden: 'Você não tem permissão para executar esta ação.',
  validation: 'Revise os campos destacados e tente novamente.',
  conflict: 'Esta operação conflita com um dado já existente.',
  'not-found': 'Não encontramos o registro solicitado.',
  unavailable: 'O serviço está indisponível agora. Tente novamente em instantes.',
  unexpected: 'Não foi possível concluir a operação agora. Tente novamente.',
}

/**
 * Monta uma Server Action a partir de um caso de uso.
 *
 * A funcao devolvida recebe `unknown` de proposito: quem chama e o navegador, e
 * a fronteira precisa tratar a entrada como nao confiavel — o Zod e a primeira
 * coisa que a toca.
 */
export function createAction<TInput, TOutput, F extends string = string>(
  options: CreateActionOptions<TInput, TOutput, F>,
): (rawInput: unknown) => Promise<ActionResult<TOutput, F>> {
  const message = (code: AppErrorCode): string =>
    options.messages?.[code] ?? defaultMessages[code]

  return async function action(rawInput: unknown): Promise<ActionResult<TOutput, F>> {
    // 1. Autenticar e 2. resolver clinica ativa — as duas na mesma leitura, ja
    // memoizada por request pelo `cache()` dentro de getSessionState().
    const session = await getSessionState()

    switch (session.status) {
      case 'not-configured':
        return err<F>('unavailable', message('unavailable'))
      case 'anonymous':
        return err<F>('unauthenticated', message('unauthenticated'))
      case 'needs-onboarding':
        return err<F>('no-active-clinic', message('no-active-clinic'))
      case 'claims-stale':
        // Ha vinculo, mas o JWT nao o carrega: qualquer escrita seria recusada
        // pela RLS. Falhar aqui e mais honesto que deixar o banco recusar.
        return err<F>('unauthenticated', message('unauthenticated'))
      case 'active':
        break
    }

    // 3. Autorizar papel.
    if (options.roles && (!session.role || !options.roles.includes(session.role))) {
      return err<F>('forbidden', message('forbidden'))
    }

    // 4. Validar a entrada.
    const parsed = options.schema.safeParse(rawInput)
    if (!parsed.success) {
      const fieldErrors: Partial<Record<F, string>> = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0]
        if (typeof field === 'string') {
          fieldErrors[field as F] ??= issue.message
        }
      }

      return err<F>('validation', message('validation'), fieldErrors)
    }

    const supabase = await createSupabaseServerClient()
    if (!supabase) return err<F>('unavailable', message('unavailable'))

    const context: ActionContext = {
      supabase,
      clinicId: session.clinicId,
      role: session.role,
      userId: session.user.id,
    }

    // 5. Executar o caso de uso.
    let result: ActionResult<TOutput, F>
    try {
      result = await options.handler(parsed.data, context)
    } catch (cause) {
      // redirect()/notFound() sinalizam por excecao — devolve-las ao Next, ou a
      // navegacao morre silenciosamente aqui dentro.
      unstable_rethrow(cause)

      // O detalhe fica no log do SERVIDOR; o usuario recebe so a mensagem
      // generica. `PostgrestError` nao e `instanceof Error`, entao registrar
      // apenas `cause.name` apagava justamente a falha vinda do banco.
      console.error('[action] falha nao tratada', {
        action: options.name,
        ...describeCause(cause),
      })
      return err<F>('unexpected', message('unexpected'))
    }

    if (!result.ok) return result

    // O narrowing de `result` nao sobrevive dentro do callback de `after()`
    // porque `result` e `let`. Capturar aqui tambem deixa explicito o que a
    // auditoria enxerga: a saida do caso de uso e a entrada ja validada.
    const output = result.data
    const input = parsed.data

    // 6. Revalidar e 7. auditar — best-effort: a escrita ja aconteceu e nao se
    // desfaz porque a observabilidade ou a invalidacao falharam. O desfecho fica
    // no log do servidor e o resultado de sucesso continua sendo devolvido.
    try {
      // A clinica sai do contexto, nunca de `input`: `parsed.data` nao entra
      // nesta chamada, e o tipo de `cacheTags` nao o oferece.
      const scope: ActionCacheScope = {
        clinicId: context.clinicId,
        userId: context.userId,
      }

      for (const tag of options.cacheTags?.(scope, output) ?? []) {
        updateTag(tag)
      }

      for (const path of options.revalidatePaths ?? []) {
        revalidatePath(path)
      }

      // `after()` roda depois da resposta: tira do caminho critico as quatro
      // idas de rede da auditoria e garante que um defeito no callback `audit`
      // nunca chegue ao usuario. `headers()` e `cookies()` continuam legiveis
      // dentro dele em Server Function — ver
      // node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md.
      after(async () => {
        try {
          const event = options.audit?.(output, input)
          if (event) await recordAuditEvent(event, { client: supabase })
        } catch (cause) {
          unstable_rethrow(cause)

          console.error('[action] auditoria falhou', {
            action: options.name,
            ...describeCause(cause),
          })
        }
      })
    } catch (cause) {
      // Preserve os sinais de controle do Next caso um callback incorreto tente
      // redirecionar ou encerrar a resposta; erros comuns nao desfazem a mutacao.
      unstable_rethrow(cause)

      console.error('[action] falha pos-mutacao', {
        action: options.name,
        ...describeCause(cause),
      })
    }

    return result
  }
}
