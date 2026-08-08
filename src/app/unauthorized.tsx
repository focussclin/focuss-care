import { LogIn } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'

/**
 * 401 — não há sessão válida, ou ela expirou.
 *
 * Diferente do 403: aqui entrar de novo RESOLVE, e por isso a ação é o login.
 *
 * O `proxy.ts` já redireciona quem chega sem sessão nas rotas privadas — esta
 * página cobre o caso em que a sessão morre no meio do request, depois do proxy
 * ter deixado passar. É a borda que o middleware não alcança.
 */
export default function Unauthorized() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg items-center px-5">
      <Card className="w-full">
        <EmptyState
          icon={LogIn}
          title="Sua sessão expirou."
          description="Entre novamente para continuar de onde parou."
          action={
            <Button asChild>
              <Link href="/login">Entrar</Link>
            </Button>
          }
        />
      </Card>
    </main>
  )
}
