import { LogIn } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { ContinueToLogin } from '@/modules/identity/ui/ContinueToLogin'

/**
 * 401 — não há sessão válida, ou ela expirou.
 *
 * Diferente do 403: aqui entrar de novo RESOLVE, e por isso a ação é o login.
 *
 * Esta é a tela nativa para chamadas explícitas a `unauthorized()` em segmentos
 * que precisem responder 401. O portão comum de `(app)` usa `redirect('/login')`
 * para manter o contrato de navegação das rotas privadas em Cloudflare Workers.
 * O componente continua preparado para preservar a origem quando esta tela
 * for usada por uma decisão de autorização específica.
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
