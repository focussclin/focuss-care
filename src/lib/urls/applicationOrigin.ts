import 'server-only'

import { headers } from 'next/headers'

/**
 * Origem pública usada em links gerados pelo servidor.
 *
 * `APP_URL` é a fonte preferida em produção. O fallback para os headers atende
 * desenvolvimento local e plataformas que encaminham corretamente host/proto;
 * a URL é validada antes de ser usada e nunca recebe dados do formulário.
 */
export async function getApplicationOrigin(): Promise<string | null> {
  const configured = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL

  if (configured) {
    const origin = parseHttpOrigin(configured)
    if (origin) return origin
  }

  const requestHeaders = await headers()
  const host = firstHeaderValue(
    requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host'),
  )
  if (!host) return null

  const protocol = firstHeaderValue(
    requestHeaders.get('x-forwarded-proto'),
  ) ?? 'http'

  return parseHttpOrigin(`${protocol}://${host}`)
}

function firstHeaderValue(value: string | null): string | null {
  return value?.split(',')[0]?.trim() || null
}

function parseHttpOrigin(value: string): string | null {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.origin
  } catch {
    return null
  }
}
