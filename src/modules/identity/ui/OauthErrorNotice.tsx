import { AlertCircle } from 'lucide-react'

/**
 * O que deu errado no retorno do Google, lido de `?error=`.
 *
 * # Por que e um componente separado, e nao um prop do formulario
 *
 * `searchParams` so se conhece em tempo de requisicao. Lido no topo da rota,
 * impede a pagina de produzir shell estatico — que e a divida P-C2. Lido dentro
 * de um `<Suspense>` que envolvesse o formulario inteiro, a troca do fallback
 * pelo conteudo REMONTARIA os campos: quem tivesse comecado a digitar o e-mail
 * durante o streaming perderia o que escreveu, numa tela de login.
 *
 * Isolando a leitura neste componente, o formulario fica fora da fronteira —
 * estatico, prerenderizado e interativo desde o primeiro byte — e so este aviso
 * chega em seguida. E o "empurre a leitura para a menor folha" que o guia do
 * Next 16 recomenda (02-guides/migrating-to-cache-components.md, secao
 * "cookies, headers, and searchParams").
 *
 * # Por que a mensagem nao vem do servidor de autenticacao
 *
 * `?error=` carrega um CODIGO conhecido, e a tela escolhe a frase. O parametro e
 * URL, ou seja, entrada do usuario: ecoar o conteudo dele na tela deixaria
 * qualquer um escrever a mensagem que a pagina de login exibe — inclusive
 * "sua sessao expirou, confirme a senha em outro endereco". Codigo desconhecido
 * cai na frase generica.
 */

const OAUTH_MESSAGES: Record<string, string> = {
  oauth_cancelled:
    'O login com Google foi cancelado. Você pode tentar novamente.',
  oauth_error:
    'Não foi possível concluir o login com Google. Tente novamente.',
  invalid_callback:
    'O retorno da autenticação é inválido. Inicie o login novamente.',
  connection_error: 'Não foi possível conectar ao serviço de autenticação.',
}

export async function OauthErrorNotice({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>
}) {
  const { error } = await searchParams
  // `?error=a&error=b` chega como array. Vale o primeiro — repetir o parametro
  // e ambiguidade de quem chamou, nao pedido de dois avisos.
  const code = Array.isArray(error) ? error[0] : error

  if (typeof code !== 'string' || code.length === 0) return null

  return (
    <div
      role="alert"
      className="mt-6 flex items-start gap-2 rounded-field border border-danger/30 bg-danger-surface px-4 py-3 text-aux text-danger"
    >
      <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{OAUTH_MESSAGES[code] ?? OAUTH_MESSAGES.oauth_error}</span>
    </div>
  )
}
