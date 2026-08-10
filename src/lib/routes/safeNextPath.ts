/**
 * Para onde levar alguém depois do login — validado.
 *
 * # O buraco que isto fecha
 *
 * Cinco lugares do produto escrevem `?next=` ao mandar alguém para o login: o
 * proxy (com o caminho que a pessoa tentou abrir), a tela de convite, a agenda e
 * a lista de pacientes quando a sessão cai no meio de uma ação. **Nenhum deles
 * era lido.** Todo login terminava em `/dashboard`.
 *
 * O caso que doía era o convite: `/convite/[token]` desvia para
 * `/login?next=/convite/<token>` e o comentário lá dizia, em voz alta, que
 * "assim o token sobrevive ao desvio". Não sobrevivia. Quem era convidado
 * entrava, caía no painel, e precisava achar o e-mail de novo — e o link de
 * convite costuma valer uma vez.
 *
 * # Por que não bastava passar o parâmetro adiante
 *
 * `next` vem da URL, e URL é escrita por quem manda o link. Repassá-la a um
 * `redirect()` é **redirecionamento aberto**: `/login?next=https://evil.net`
 * mandaria alguém recém-autenticado para fora do domínio, com a barra de
 * endereços vindo do site em que ela acabou de digitar a senha. É por isso que a
 * versão anterior fixava tudo em `/dashboard` — seguro por ser inútil.
 *
 * # Como a validação funciona
 *
 * A checagem que decide é comparar a ORIGEM depois de resolver a entrada contra
 * uma base sentinela. Não é uma lista de caracteres proibidos, porque essa lista
 * sempre esquece um: `//evil.net` e `/\evil.net` **trocam de origem** e não têm
 * dois pontos nem "http"; `%2f%2f` e `\t` no meio parecem trocar e não trocam. O
 * parser de URL já sabe todas essas regras, e é ele quem responde.
 */

/**
 * Origem que não existe.
 *
 * Serve só de referência para resolver o caminho: se a entrada conseguir mudar a
 * origem, ela não era um caminho interno. O domínio `.invalid` é reservado
 * justamente para isto (RFC 2606) e nunca resolve para lugar nenhum.
 */
const SENTINEL_ORIGIN = 'https://sentinela.invalid'

/** Destino quando não há pedido válido. */
export const DEFAULT_AFTER_LOGIN = '/dashboard'

/**
 * Caminhos que não podem ser destino de "depois do login".
 *
 * `/login` e `/cadastro` porque o proxy devolve quem já está autenticado ao
 * dashboard — mandar alguém para lá é um salto que não leva a lugar nenhum.
 * `/auth/**` porque são rotas de máquina: `/auth/callback` sem um `code` só
 * sabe responder "callback inválido".
 *
 * **`/redefinir-senha` NÃO entra nesta lista**, e a exceção é o fluxo inteiro de
 * recuperação de senha: é exatamente para lá que o link do e-mail leva depois de
 * o callback abrir a sessão. `/recuperar-senha` também fica de fora — é uma tela
 * pública que renderiza normalmente para quem já entrou.
 */
const LOOPING_PREFIXES = ['/login', '/cadastro', '/auth'] as const

/**
 * Comprimento máximo. Um caminho real do produto não passa disso, e recusar
 * cedo evita alimentar o parser com entrada grande à toa.
 */
const MAX_LENGTH = 512

/**
 * Caminho interno seguro, ou o padrão.
 *
 * Devolve `pathname + search`. O fragmento (`#`) é descartado de propósito: ele
 * nunca chega ao servidor, e este valor é usado num `redirect()` de servidor.
 */
export function safeNextPath(
  raw: unknown,
  fallback: string = DEFAULT_AFTER_LOGIN,
): string {
  if (typeof raw !== 'string') return fallback
  if (raw.length === 0 || raw.length > MAX_LENGTH) return fallback

  let resolved: URL
  try {
    resolved = new URL(raw, SENTINEL_ORIGIN)
  } catch {
    return fallback
  }

  // A checagem que vale: se a origem mudou, não era caminho interno.
  if (resolved.origin !== SENTINEL_ORIGIN) return fallback

  const destination = `${resolved.pathname}${resolved.search}`

  // A raiz não é destino útil: ela mesma redireciona conforme a sessão.
  if (resolved.pathname === '/') return fallback

  const loops = LOOPING_PREFIXES.some(
    (prefix) =>
      resolved.pathname === prefix || resolved.pathname.startsWith(`${prefix}/`),
  )
  if (loops) return fallback

  return destination
}

/**
 * O caminho é seguro **e** diferente do padrão?
 *
 * Serve a quem precisa decidir se vale a pena carregar o `next` adiante — o
 * login com Google, por exemplo, só acrescenta o parâmetro à URL de retorno
 * quando ele diz alguma coisa.
 */
export function hasCustomNextPath(raw: unknown): boolean {
  return safeNextPath(raw, DEFAULT_AFTER_LOGIN) !== DEFAULT_AFTER_LOGIN
}
