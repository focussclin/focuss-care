import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import {
  isSupabaseConfigured,
  supabasePublishableKey,
  supabaseUrl,
} from '@/lib/supabase/config'

const publicPaths = new Set([
  '/',
  '/login',
  '/cadastro',
  '/recuperar-senha',
  '/redefinir-senha',
  '/auth/callback',
])

function isPublicPath(pathname: string) {
  return publicPaths.has(pathname) || pathname.startsWith('/auth/callback/')
}

function redirectPreservingCookies(response: NextResponse, destination: URL) {
  const redirectResponse = NextResponse.redirect(destination)
  for (const cookie of response.cookies.getAll()) {
    redirectResponse.cookies.set(cookie)
  }
  return redirectResponse
}

/**
 * Divisao de responsabilidade (doc do Next 16, "Optimistic checks with Proxy"):
 *
 *  - AQUI: apenas a checagem otimista de SESSAO, lendo o cookie. O proxy roda em
 *    toda rota, inclusive prefetch — consulta a banco aqui custa em toda
 *    navegacao e nao pode ser a unica defesa.
 *  - Na renderizacao no servidor: a checagem de VINCULO de clinica
 *    (src/app/(app)/layout.tsx e src/app/(auth)/onboarding/page.tsx), via
 *    src/lib/auth/session.ts.
 *  - Nos repositorios (src/lib/data-source.ts): a guarda final de dados.
 *
 * Por isso `/onboarding` nao esta em publicPaths: precisa de sessao, e quem ja
 * tem clinica e devolvido ao dashboard pela propria pagina.
 */

export async function proxy(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.next()

  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    supabaseUrl,
    supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // getClaims() devolve `data: null` quando nao ha sessao — desestruturar direto
  // quebraria em toda visita anonima.
  const { data } = await supabase.auth.getClaims()
  const authenticated = Boolean(data?.claims)
  const pathname = request.nextUrl.pathname

  if (!authenticated && !isPublicPath(pathname)) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return redirectPreservingCookies(response, loginUrl)
  }

  if (authenticated && (pathname === '/login' || pathname === '/cadastro')) {
    return redirectPreservingCookies(
      response,
      new URL('/dashboard', request.url),
    )
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
