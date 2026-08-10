import { NextResponse, type NextRequest } from 'next/server'

import { safeNextPath } from '@/lib/routes/safeNextPath'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Retorno do Supabase Auth — usado pelo login com Google **e** pelo link de
 * recuperação de senha (P-RS).
 *
 * Os dois fluxos chegam da mesma forma (um `code` para trocar por sessão) e
 * divergem só no destino e no lugar onde a falha faz sentido. Quem pediu senha
 * nova e clicou num link vencido não pode cair em `/login` lendo "o login com
 * Google foi cancelado" — mensagem errada na tela errada é o mesmo que nenhuma.
 */

const RESET_PATH = '/redefinir-senha'
const RECOVERY_REQUEST_PATH = '/recuperar-senha'

/**
 * O destino é validado, não conferido contra uma lista de dois itens.
 *
 * `next` vem da URL, e URL é entrada de quem clicou no link: sem validação,
 * `/auth/callback?next=https://exemplo.net` mandaria uma sessão recém-aberta
 * para fora do domínio.
 *
 * Até aqui a defesa era um `Set` com `/dashboard` e `/redefinir-senha`, o que
 * era seguro e custava o resto: quem foi convidado, desviado ao login e entrou
 * com o Google perdia o convite no caminho, porque `/convite/<token>` não estava
 * — nem poderia estar — numa lista fixa. `safeNextPath` aceita qualquer caminho
 * INTERNO e recusa o que troca de origem; é o mesmo validador que a entrada por
 * senha usa, então os dois caminhos de login não podem divergir.
 */
function getSafeNextPath(value: string | null) {
  return safeNextPath(value)
}

function redirectToLogin(request: NextRequest, code: string) {
  const url = new URL('/login', request.url)
  url.searchParams.set('error', code)
  return NextResponse.redirect(url)
}

/**
 * Falha do link de recuperação volta para **onde se pede outro link**, com o
 * motivo em código próprio — nunca com o texto do provedor, que é URL e portanto
 * escrito por quem monta o link.
 */
function redirectToRecovery(request: NextRequest, reason: 'expirado' | 'invalido') {
  const url = new URL(RECOVERY_REQUEST_PATH, request.url)
  url.searchParams.set('erro', reason)
  return NextResponse.redirect(url)
}

/** O provedor diz "expirou" de mais de uma forma; nenhuma delas é exibida. */
function isExpiredLink(request: NextRequest): boolean {
  const errorCode = request.nextUrl.searchParams.get('error_code') ?? ''
  const description =
    request.nextUrl.searchParams.get('error_description') ?? ''

  return (
    errorCode === 'otp_expired' ||
    description.toLowerCase().includes('expired')
  )
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const authError = request.nextUrl.searchParams.get('error')
  const nextPath = getSafeNextPath(request.nextUrl.searchParams.get('next'))
  const isRecovery = nextPath === RESET_PATH

  if (authError) {
    if (isRecovery) {
      return redirectToRecovery(
        request,
        isExpiredLink(request) ? 'expirado' : 'invalido',
      )
    }

    if (authError === 'access_denied') {
      return redirectToLogin(request, 'oauth_cancelled')
    }

    return redirectToLogin(request, 'oauth_error')
  }

  if (!code) {
    return isRecovery
      ? redirectToRecovery(request, 'invalido')
      : redirectToLogin(request, 'invalid_callback')
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return isRecovery
      ? redirectToRecovery(request, 'invalido')
      : redirectToLogin(request, 'connection_error')
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    /*
     * A troca falha quando o link venceu, quando já foi usado, e tambem quando
     * foi aberto num navegador diferente do que fez o pedido — o verificador
     * PKCE fica no cookie de quem pediu. Os tres viram "peça outro link", que e
     * a acao que resolve os tres.
     */
    return isRecovery
      ? redirectToRecovery(request, 'expirado')
      : redirectToLogin(request, 'oauth_error')
  }

  return NextResponse.redirect(new URL(nextPath, request.url))
}
