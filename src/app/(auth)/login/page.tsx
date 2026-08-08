import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'

import { getSessionState } from '@/lib/auth/session'
import { LoginFormContainer } from '@/modules/identity/ui/LoginForm.container'
import { OauthErrorNotice } from '@/modules/identity/ui/OauthErrorNotice'

export const metadata: Metadata = {
  title: 'Entrar · Focuss Care',
  description: 'Acesse sua conta do Focuss Care e continue de onde parou.',
}

/**
 * Login — a primeira rota de `(auth)` a sair do `instant = false` (P-C2).
 *
 * # O que mudou
 *
 * Antes a rota lia `searchParams` no topo. `cacheComponents` (F-02) exige que
 * toda pagina produza um shell estatico nao vazio, e um `await searchParams`
 * antes do primeiro elemento nao deixa sobrar nada para prerenderizar — dai o
 * `instant = false`, que era saida documentada para adocao incremental, nao
 * destino.
 *
 * Agora o formulario inteiro esta FORA de qualquer fronteira dinamica: ele e o
 * shell. Quem chega em `/login` recebe a tela pronta e ja interativa, sem
 * esperar servidor nenhum. So o aviso de retorno do OAuth depende da URL, e ele
 * fica dentro do `<Suspense>`.
 *
 * # Por que o `<Suspense>` nao envolve o formulario
 *
 * Seria o recorte obvio — e apagaria o que a pessoa digitou. Quando o conteudo
 * substitui o fallback, a arvore e REMONTADA: um campo de e-mail preenchido
 * durante o streaming volta vazio. Numa tela de login isso e inaceitavel, e e
 * por isso que a leitura foi empurrada ate a menor folha possivel, como o guia
 * do Next 16 recomenda.
 *
 * `fallback={null}` porque a ausencia do aviso e o estado normal: a esmagadora
 * maioria dos acessos a `/login` nao vem de erro de OAuth, e reservar espaco
 * para uma mensagem que quase nunca aparece deslocaria o formulario.
 */
/** A validacao server-side substitui o proxy no runtime Cloudflare Workers. */
export const instant = false

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const session = await getSessionState()

  if (session.status === 'active') redirect('/dashboard')
  if (session.status === 'needs-onboarding' || session.status === 'claims-stale') {
    redirect('/onboarding')
  }

  return (
    <LoginFormContainer
      notice={
        <Suspense fallback={null}>
          <OauthErrorNotice searchParams={searchParams} />
        </Suspense>
      }
    />
  )
}
