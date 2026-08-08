import { AlertCircle, CheckCircle2 } from 'lucide-react'

import { passwordRecoveryMessages } from '../schemas/passwordRecovery.schema'

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

/**
 * Avisos de SUCESSO que outra tela deixou para o login exibir.
 *
 * Hoje ha um so: a senha acabou de ser trocada e a sessao do link foi encerrada
 * de proposito (ver `updatePassword.action.ts`). Sem este aviso, a pessoa cairia
 * numa tela de login sem entender por que precisa entrar de novo — e concluiria
 * que a troca falhou.
 */
const SUCCESS_MESSAGES: Record<string, string> = {
  'senha-redefinida': passwordRecoveryMessages.passwordUpdated,
}

/** `?p=a&p=b` chega como array. Vale o primeiro: repetir e ambiguidade. */
function firstValue(value: string | string[] | undefined): string | null {
  const raw = Array.isArray(value) ? value[0] : value
  return typeof raw === 'string' && raw.length > 0 ? raw : null
}

export async function OauthErrorNotice({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; aviso?: string | string[] }>
}) {
  const { error, aviso } = await searchParams

  const success = firstValue(aviso)
  if (success !== null && success in SUCCESS_MESSAGES) {
    return (
      <div
        role="status"
        className="mt-6 flex items-start gap-2 rounded-field border border-status-positive/30 bg-status-positive-surface px-4 py-3 text-aux text-foreground"
      >
        <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>{SUCCESS_MESSAGES[success]}</span>
      </div>
    )
  }

  const code = firstValue(error)

  if (code === null) return null

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
