import { LogIn } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { ContinueToLogin } from '@/modules/identity/ui/ContinueToLogin'

/**
 * 401 — não há sessão válida, ou ela expirou.
 *
 * Diferente do 403: aqui entrar de novo RESOLVE, e por isso a ação é o login.
 *
 * # Esta página é o portão da área autenticada
 *
 * O comentário anterior dizia que ela cobria só a borda que o `proxy.ts` não
 * alcançava. **O proxy não existe mais** — saiu na migração para Cloudflare
 * Workers —, e desde então a casca de `(app)` chama `unauthorized()`: é aqui que
 * cai qualquer acesso sem sessão às 14 rotas privadas.
 *
 * A escolha de `unauthorized()` em vez de `redirect('/login')` é o que preserva
 * o destino: o 401 é servido **na URL original**, então quem abriu
 * `/pacientes/<id>` continua nela, e `ContinueToLogin` lê esse endereço para
 * levá-lo ao login. Com um desvio, o endereço já teria sido trocado antes de
 * alguém poder lê-lo.
 */
export default function Unauthorized() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg items-center px-5">
      <Card className="w-full">
        <EmptyState
          icon={LogIn}
          title="Sua sessão expirou."
          description="Entre novamente para continuar de onde parou."
          action={<ContinueToLogin />}
        />
      </Card>
    </main>
  )
}
