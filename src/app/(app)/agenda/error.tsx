'use client'

import { CalendarX2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'

/**
 * Estado de erro da agenda (AGENDA_DESIGN.md, secao "Estados").
 * Usa o error boundary nativo do App Router: o botao chama retry(), que refaz a
 * renderizacao do segmento — nao e um botao decorativo.
 */
export default function AgendaError({ retry }: { retry: () => void }) {
  return (
    <Card>
      <EmptyState
        icon={CalendarX2}
        title="Não foi possível carregar a agenda."
        description="Verifique sua conexão e tente novamente em instantes."
        action={<Button onClick={retry}>Tentar novamente</Button>}
      />
    </Card>
  )
}
