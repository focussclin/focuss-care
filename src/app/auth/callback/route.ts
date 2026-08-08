import { NextResponse, type NextRequest } from 'next/server'

import { createSupabaseServerClient } from '@/lib/supabase/server'

const allowedNextPaths = new Set(['/dashboard', '/redefinir-senha'])

function getSafeNextPath(value: string | null) {
  return value && allowedNextPaths.has(value) ? value : '/dashboard'
}

function redirectToLogin(request: NextRequest, code: string) {
  const url = new URL('/login', request.url)
  url.searchParams.set('error', code)
  return NextResponse.redirect(url)
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const oauthError = request.nextUrl.searchParams.get('error')
  const nextPath = getSafeNextPath(request.nextUrl.searchParams.get('next'))

  if (oauthError === 'access_denied') {
    return redirectToLogin(request, 'oauth_cancelled')
  }

  if (!code) return redirectToLogin(request, 'invalid_callback')

  const supabase = await createSupabaseServerClient()
  if (!supabase) return redirectToLogin(request, 'connection_error')

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return redirectToLogin(request, 'oauth_error')

  return NextResponse.redirect(new URL(nextPath, request.url))
}
