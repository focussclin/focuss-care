/**
 * Retorno tipado de erro — sem `throw` solto atravessando camadas.
 *
 * Por que existe: uma Server Action atravessa a fronteira servidor/cliente. O que
 * ela devolve e serializado e chega na tela. Excecao nao atravessa essa fronteira
 * com a mensagem intacta (em producao o Next substitui por um digest), entao erro
 * esperado — validacao, permissao, conflito — precisa ser VALOR, nao excecao.
 *
 * Regras deste arquivo:
 *
 *  - TS puro. Nao importa React, Next, Supabase nem nada de `ui/`. Domain nao
 *    conhece framework (secao 5 de docs/01-arquitetura.md).
 *  - Tudo aqui e serializavel: objetos simples, sem classe, sem Date, sem Symbol.
 *    O que nao serializa nao atravessa a fronteira da Server Action.
 *  - `message` e sempre texto pronto para exibicao, em pt-BR, e NUNCA carrega
 *    detalhe do banco (codigo do Postgres, nome de constraint, SQL).
 */

/**
 * Vocabulario fechado de falha de aplicacao.
 *
 * Fechado de proposito: quem consome um `AppError` precisa poder decidir o que
 * fazer (mandar ao login, marcar campo, mostrar aviso) por um `switch` exaustivo.
 * Uma string livre devolveria o problema para o chamador.
 */
export type AppErrorCode =
  /** Nao ha sessao valida. Destino: /login. */
  | 'unauthenticated'
  /** Ha sessao, mas nenhuma clinica ativa. Destino: /onboarding. */
  | 'no-active-clinic'
  /** Ha clinica ativa, mas o papel do usuario nao autoriza a acao. */
  | 'forbidden'
  /** A entrada nao passou no schema. Ver `fieldErrors`. */
  | 'validation'
  /** O estado atual do dado impede a operacao (slug em uso, agenda ocupada). */
  | 'conflict'
  /**
   * A operacao e possivel, mas exige confirmacao explicita.
   *
   * Nao e erro, e a distincao e o motivo de o codigo existir: 'conflict' diz
   * "nao da", e este diz "da, se voce confirmar". Agendar fora do horario de
   * funcionamento da clinica (A-02) e o primeiro caso — encaixe fora do
   * expediente acontece, e recusa-lo faria a recepcao registrar hora falsa.
   *
   * Quem recebe este codigo deve oferecer a confirmacao, nunca so exibir a
   * mensagem: sem o caminho de volta, vira uma recusa com texto amigavel.
   */
  | 'needs-confirmation'
  /** O alvo nao existe — ou existe em outra clinica, o que da no mesmo aqui. */
  | 'not-found'
  /** Dependencia externa indisponivel (Supabase fora do ar ou nao configurado). */
  | 'unavailable'
  /** Falha nao classificada. A causa real fica no log do servidor, nunca na tela. */
  | 'unexpected'

/**
 * Falha de aplicacao pronta para a UI.
 *
 * `F` e a uniao dos nomes de campo do formulario, para que `fieldErrors` nao
 * aceite uma chave que a view nao sabe marcar.
 */
export interface AppError<F extends string = string> {
  code: AppErrorCode
  /** Mensagem em pt-BR, pronta para exibicao. Sem detalhe de banco. */
  message: string
  /** Preenchido quando `code` e 'validation' — uma mensagem por campo. */
  fieldErrors?: Partial<Record<F, string>>
}

/** Sucesso com valor, ou falha com erro de aplicacao. Nunca os dois. */
export type Result<T, E = AppError> =
  | { ok: true; data: T }
  | { ok: false; error: E }

/**
 * O que uma Server Action devolve.
 *
 * Alias com nome proprio porque e o tipo que aparece no contrato de props e nos
 * containers — `ActionResult<Patient>` le melhor que `Result<Patient, AppError>`
 * e deixa claro que aquele valor cruzou a fronteira do servidor.
 */
export type ActionResult<T, F extends string = string> = Result<T, AppError<F>>

export function ok(): Result<void, never>
export function ok<T>(data: T): Result<T, never>
export function ok<T>(data?: T): Result<T | void, never> {
  return { ok: true, data: data as T }
}

export function err<F extends string = string>(
  code: AppErrorCode,
  message: string,
  fieldErrors?: Partial<Record<F, string>>,
): Result<never, AppError<F>> {
  return {
    ok: false,
    error: fieldErrors ? { code, message, fieldErrors } : { code, message },
  }
}

/** Guarda de tipo para estreitar `Result` no ramo de sucesso. */
export function isOk<T, E>(
  result: Result<T, E>,
): result is { ok: true; data: T } {
  return result.ok
}

/** Guarda de tipo para estreitar `Result` no ramo de falha. */
export function isErr<T, E>(
  result: Result<T, E>,
): result is { ok: false; error: E } {
  return !result.ok
}
