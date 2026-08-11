import 'server-only'

import { headers } from 'next/headers'

import {
  checkRateLimit,
  LOGIN_RATE_LIMIT,
  registerFailure,
  type RateLimitState,
  type RateLimitVerdict,
} from './rate-limit'

/**
 * O controle de taxa do login, com armazenamento.
 *
 * # A LIMITAÇÃO, declarada antes de qualquer coisa
 *
 * O estado vive em **memória do processo**. Em produção o produto roda em
 * Cloudflare Workers, onde cada isolate tem a própria memória: um atacante que
 * caia em isolates diferentes ganha uma janela livre em cada um. Isto **não é**
 * controle de taxa distribuído, e chamá-lo assim seria pior do que não tê-lo.
 *
 * O que ele entrega de verdade: encarece o ataque ingênuo (um cliente, uma
 * conexão, muitas tentativas), que é a forma mais comum, e fecha o caso em
 * desenvolvimento e em instância única.
 *
 * # Como destravar a versão durável
 *
 * Duas saídas, nenhuma disponível hoje:
 *
 *  1. **Tabela no Postgres** — `login_attempts (key, failures, last_failure_at)`
 *     com RLS de serviço. Depende de aplicar migration, bloqueio **B1**.
 *  2. **Regra no edge** — WAF/Rate Limiting da Cloudflare no caminho de
 *     `/login`. Não passa por este código e não custa migration; é a saída mais
 *     barata, e é decisão de infraestrutura.
 *
 * A política em si (`rate-limit.ts`) não muda em nenhum dos dois casos — só o
 * armazenamento.
 */

/** Estado por chave. `Map` simples: o processo é a fronteira, e ele reinicia. */
const attempts = new Map<string, RateLimitState>()

/**
 * Teto de chaves guardadas.
 *
 * Sem ele, um atacante variando o e-mail faria o mapa crescer até derrubar o
 * processo — trocar força bruta por exaustão de memória não é ganho. Ao
 * estourar, a entrada mais antiga sai: perder o contador de alguém é aceitável;
 * perder o processo não.
 */
const MAX_KEYS = 10_000

/**
 * A chave combina e-mail e origem.
 *
 * Só e-mail deixaria qualquer um trancar a conta alheia de fora. Só IP puniria
 * a clínica inteira atrás de um NAT por causa de uma pessoa. Os dois juntos
 * limitam o par, que é o que o atacante controla de fato.
 *
 * O e-mail é normalizado — mesma forma que o schema de login produz — para que
 * `Ana@Clinica.com` e `ana@clinica.com` compartilhem contador.
 */
async function keyFor(email: string): Promise<string> {
  const store = await headers()

  /*
   * `cf-connecting-ip` primeiro: em Cloudflare é o único que o cliente não
   * consegue forjar. `x-forwarded-for` aceita o primeiro salto e vale como
   * aproximação em outros ambientes; ausente, o par vira só o e-mail.
   */
  const ip =
    store.get('cf-connecting-ip') ??
    store.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'sem-origem'

  return `${email.trim().toLowerCase()}|${ip}`
}

export async function checkLoginThrottle(email: string): Promise<RateLimitVerdict> {
  const key = await keyFor(email)
  return checkRateLimit(attempts.get(key), Date.now(), LOGIN_RATE_LIMIT)
}

export async function registerLoginFailure(email: string): Promise<void> {
  const key = await keyFor(email)

  if (!attempts.has(key) && attempts.size >= MAX_KEYS) {
    const oldest = attempts.keys().next().value
    if (oldest !== undefined) attempts.delete(oldest)
  }

  attempts.set(key, registerFailure(attempts.get(key), Date.now(), LOGIN_RATE_LIMIT))
}

/**
 * Login bem-sucedido zera o contador.
 *
 * Sem isto, quem errou quatro vezes e acertou na quinta carregaria o backoff
 * para a próxima sessão — e a punição cairia sobre quem já provou ser dono da
 * conta.
 */
export async function clearLoginThrottle(email: string): Promise<void> {
  attempts.delete(await keyFor(email))
}
