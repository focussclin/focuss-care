import { SearchX } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'

/**
 * O que aparece quando uma rota chama `notFound()`.
 *
 * Não havia `not-found.tsx` nenhum no projeto, e `notFound()` **é chamado** —
 * em `/pacientes/[patientId]` e no histórico, nos dois casos que mais importam:
 * id que não é UUID, e paciente que não existe **nesta clínica**.
 *
 * O segundo é o que torna esta tela parte da fronteira de tenant, e não
 * decoração. Trocar o id na URL pelo de um paciente de outra clínica cai aqui,
 * e a resposta precisa ser exatamente a mesma de um id inventado: "não existe".
 * Qualquer diferença entre os dois casos — texto, código, tempo de resposta —
 * responderia a pergunta "esta pessoa é paciente de alguma clínica?", que não é
 * pergunta que este produto deva responder a quem não é da clínica dela.
 *
 * Fica dentro de `(app)`, então a casca continua: o menu segue ali, e o
 * caminho de volta não depende de o usuário lembrar a URL.
 */
export default function AppNotFound() {
  return (
    <Card>
      <EmptyState
        icon={SearchX}
        title="Não encontramos o que você procurava."
        description="O endereço pode estar errado, ou o registro não pertence a esta clínica."
        action={
          <Button asChild>
            <Link href="/dashboard">Voltar ao painel</Link>
          </Button>
        }
      />
    </Card>
  )
}
