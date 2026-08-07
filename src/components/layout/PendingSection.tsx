import { Compass } from 'lucide-react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'

import { PageHeader } from './PageHeader'

export interface PendingSectionProps {
  eyebrow: string
  title: string
  description: string
}

/**
 * Placeholder das seccoes da navegacao que ainda nao receberam handoff do Codex.
 *
 * Existe para que a sidebar nao aponte para 404 e para deixar explicito que a tela
 * esta pendente de design — em vez de inventarmos uma direcao visual que depois
 * conflitaria com o handoff real.
 */
export function PendingSection({
  eyebrow,
  title,
  description,
}: PendingSectionProps) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />

      <Card>
        <EmptyState
          icon={Compass}
          title="Esta área ainda está em construção."
          description="A tela será implementada assim que o handoff de design correspondente chegar."
          action={
            <Button asChild variant="secondary">
              <Link href="/dashboard">Voltar para a visão geral</Link>
            </Button>
          }
        />
      </Card>
    </div>
  )
}
