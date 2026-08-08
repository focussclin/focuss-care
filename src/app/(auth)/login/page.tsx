import type { Metadata } from 'next'

import { LoginFormContainer } from '@/modules/identity/ui/LoginForm.container'

export const metadata: Metadata = {
  title: 'Entrar · Focuss Care',
  description:
    'Acesse sua conta do Focuss Care e continue de onde parou.',
}

/**
 * `searchParams` e Request-time API: le-la no topo impede o shell estatico que
 * `cacheComponents` (F-02) passou a exigir. O conserto recomendado — passar a
 * promessa a um filho dentro de `<Suspense>` — precisa de um fallback desenhado
 * para esta tela, que e handoff do Codex. Ate la, o segmento declara que pode
 * bloquear; nada aqui e cacheado.
 * Ver node_modules/next/dist/docs/01-app/02-guides/migrating-to-cache-components.md
 * §"cookies, headers, and searchParams".
 */
export const instant = false

export default async function LoginPage({
  searchParams,
}: PageProps<'/login'>) {
  const { error, next } = await searchParams

  return (
    <LoginFormContainer
      oauthError={typeof error === 'string' ? error : undefined}
      nextPath={typeof next === 'string' ? next : undefined}
    />
  )
}
