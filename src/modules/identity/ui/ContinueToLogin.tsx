'use client'

import Link from 'next/link'
import { useSyncExternalStore } from 'react'

import { Button } from '@/components/ui/button'
import { DEFAULT_AFTER_LOGIN, safeNextPath } from '@/lib/routes/safeNextPath'

/**
 * O botão "Entrar" da página 401, carregando de onde a pessoa veio.
 *
 * # Por que existe um componente de cliente para montar um link
 *
 * Uma chamada explícita a `unauthorized()` serve a página **na URL original**.
 * Server Component não lê o próprio caminho:
 * `usePathname` é hook, e `headers()` não traz o pathname sem middleware, que
 * saiu na migração para Cloudflare Workers.
 *
 * Então quem lê o endereço é o navegador.
 *
 * # Por que `useSyncExternalStore`, e não estado com efeito
 *
 * O caminho óbvio — `useState('/login')` mais um `useEffect` que corrige — é um
 * `setState` dentro de efeito: dois renders para chegar onde um chegava, e o
 * que a regra `react-hooks/set-state-in-effect` cobra, com razão.
 *
 * `useSyncExternalStore` é a primitiva feita para isto: lê um valor que vive
 * FORA do React (a barra de endereços) e aceita um snapshot de servidor
 * separado. O `subscribe` devolve uma função vazia porque o valor não muda
 * enquanto a página existe — quem navega troca de página.
 *
 * # O snapshot de servidor é `/login` puro, e ele NÃO chega a virar HTML
 *
 * Medido em `next build` + `next start`: sob `cacheComponents`, o portão da
 * casca de `(app)` renderiza no cliente, e o corpo desta página não vai no HTML
 * inicial — nem esta ação, nem o texto ao redor.
 *
 * **Isso não é regressão desta fatia.** O mesmo build com o `redirect('/login')`
 * anterior também respondia 200 e navegava pelo cliente: sem JavaScript, a
 * pessoa já ficava numa tela vazia antes desta mudança. O snapshot de servidor
 * existe como valor correto para a hidratação, não como promessa de degradação
 * graciosa — que este app, hoje, não tem em nenhuma rota privada.
 *
 * # O valor não é confiável, e isso está certo
 *
 * `window.location` é a barra de endereços, e o servidor a trata como entrada
 * hostil: `signInAction` passa por `safeNextPath` antes de qualquer `redirect`.
 * A validação daqui é conveniência — evita montar um link que o servidor vai
 * descartar —, não fronteira de segurança.
 */

/** O valor não muda enquanto a página vive; navegar troca de página. */
const subscribe = () => () => {}

const serverHref = () => '/login'

function clientHref(): string {
  const destination = safeNextPath(
    `${window.location.pathname}${window.location.search}`,
  )

  // Destino igual ao padrão não vira parâmetro: `/login?next=/dashboard` é
  // ruído na barra de endereços e não muda nada.
  return destination === DEFAULT_AFTER_LOGIN
    ? '/login'
    : `/login?next=${encodeURIComponent(destination)}`
}

export function ContinueToLogin() {
  const href = useSyncExternalStore(subscribe, clientHref, serverHref)

  return (
    <Button asChild>
      <Link href={href}>Entrar</Link>
    </Button>
  )
}
