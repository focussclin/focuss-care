import { ShieldOff } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'

/**
 * 403 — a sessão é válida, o papel não alcança.
 *
 * Renderizada quando alguma parte do servidor chama `forbidden()`. Existe
 * separada de `unauthorized.tsx` porque as duas situações pedem saídas
 * diferentes: aqui entrar de novo não resolve nada, e mandar o usuário para o
 * login seria um loop com cara de bug.
 *
 * **Não diz o que existe do outro lado.** "Você não tem permissão para ver os
 * dados financeiros de julho" confirma que julho tem dados — a mensagem fala do
 * acesso, nunca do conteúdo.
 */
export default function Forbidden() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg items-center px-5">
      <Card className="w-full">
        <EmptyState
          icon={ShieldOff}
          title="Você não tem acesso a esta área."
          description="Seu perfil nesta clínica não inclui esta permissão. Se precisar dela, fale com quem administra a clínica."
          action={
            <Button asChild>
              <Link href="/dashboard">Voltar ao início</Link>
            </Button>
          }
        />
      </Card>
    </main>
  )
}
