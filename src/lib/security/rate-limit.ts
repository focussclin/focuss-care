/**
 * Controle de taxa — a política, sem armazenamento e sem relógio próprio.
 *
 * # O que estava faltando
 *
 * Não havia nenhum controle de taxa no produto. `signInAction` aceitava
 * tentativas na velocidade que a rede permitisse, e é a superfície mais exposta
 * de um sistema com dado de saúde: senha fraca mais tentativa ilimitada é o
 * caminho mais curto para dentro.
 *
 * # Backoff, e não bloqueio permanente
 *
 * A janela cresce a cada falha e **expira sozinha**. Bloqueio permanente
 * transformaria o controle numa arma: quem soubesse o e-mail de alguém trancaria
 * a conta dessa pessoa de fora, e o suporte viraria o caminho do ataque.
 *
 * # Puro de propósito
 *
 * Recebe estado e instante, devolve decisão e estado novo. Sem `Date.now()` e
 * sem mapa global aqui dentro: é o que permite testar a curva inteira sem
 * esperar um minuto de relógio, e o que deixa trocar o armazenamento — memória
 * hoje, tabela ou Redis quando existirem — sem tocar na regra.
 */

export interface RateLimitConfig {
  /** Tentativas livres antes de o backoff começar. */
  freeAttempts: number
  /** Primeira espera, em milissegundos. Dobra a cada falha seguinte. */
  baseDelayMs: number
  /** Teto da espera — o backoff não cresce para sempre. */
  maxDelayMs: number
  /** Sem falha por este tempo, o contador zera. */
  resetAfterMs: number
}

/**
 * Cinco tentativas livres, depois 1s dobrando até 5 min, e esquece em 15 min.
 *
 * Os números não são arbitrários: cinco cobre quem errou o layout do teclado ou
 * o Caps Lock sem perceber; 5 minutos de teto torna a força bruta inviável sem
 * deixar ninguém trancado para sempre; 15 minutos de esquecimento é mais curto
 * que um turno de recepção, então quem errou de manhã não paga à tarde.
 */
export const LOGIN_RATE_LIMIT: RateLimitConfig = {
  freeAttempts: 5,
  baseDelayMs: 1_000,
  maxDelayMs: 5 * 60_000,
  resetAfterMs: 15 * 60_000,
}

export interface RateLimitState {
  /** Falhas consecutivas contadas até agora. */
  failures: number
  /** Instante da última falha, em epoch ms. */
  lastFailureAt: number
}

export interface RateLimitVerdict {
  allowed: boolean
  /** Quanto falta esperar, em ms. Zero quando `allowed`. */
  retryAfterMs: number
}

/**
 * A espera devida depois de `failures` falhas consecutivas.
 *
 * Zero enquanto as tentativas livres não acabam. Depois disso, dobra: 1s, 2s,
 * 4s… até o teto. O expoente conta a partir da PRIMEIRA falha excedente, e não
 * do total — senão a sexta tentativa já cairia no teto.
 */
export function delayFor(failures: number, config: RateLimitConfig): number {
  const excess = failures - config.freeAttempts
  if (excess <= 0) return 0

  const delay = config.baseDelayMs * 2 ** (excess - 1)
  return Math.min(delay, config.maxDelayMs)
}

/**
 * A tentativa pode seguir agora?
 *
 * `state` ausente é primeira tentativa — sempre permitida.
 */
export function checkRateLimit(
  state: RateLimitState | undefined,
  now: number,
  config: RateLimitConfig,
): RateLimitVerdict {
  if (!state) return { allowed: true, retryAfterMs: 0 }

  // Silêncio longo o bastante: o contador já não vale.
  if (now - state.lastFailureAt >= config.resetAfterMs) {
    return { allowed: true, retryAfterMs: 0 }
  }

  const waited = now - state.lastFailureAt
  const required = delayFor(state.failures, config)

  if (waited >= required) return { allowed: true, retryAfterMs: 0 }

  return { allowed: false, retryAfterMs: required - waited }
}

/**
 * Estado depois de uma tentativa que FALHOU.
 *
 * Falha após a janela de esquecimento recomeça do zero: quem errou uma vez hoje
 * de manhã não deve herdar o backoff daquilo à noite.
 */
export function registerFailure(
  state: RateLimitState | undefined,
  now: number,
  config: RateLimitConfig,
): RateLimitState {
  const expired = !state || now - state.lastFailureAt >= config.resetAfterMs

  return {
    failures: expired ? 1 : state.failures + 1,
    lastFailureAt: now,
  }
}

/**
 * Quanto tempo dizer para a pessoa esperar, em segundos e arredondado para cima.
 *
 * Arredondar para baixo produziria "tente em 0 segundos" para qualquer espera
 * menor que um segundo — e a tentativa seguinte seria recusada de novo.
 */
export function retryAfterSeconds(retryAfterMs: number): number {
  return Math.max(1, Math.ceil(retryAfterMs / 1_000))
}
