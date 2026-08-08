'use client'

import { UserX } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'

/** Estado de erro da listagem (PATIENTS_DESIGN.md, secao "Estados"). */
export default function PacientesError({ reset }: { reset: () => void }) {
  return (
    <Card>
      <EmptyState
        icon={UserX}
        title="Não foi possível carregar os pacientes."
        description="Verifique sua conexão e tente novamente em instantes."
        action={<Button onClick={reset}>Tentar novamente</Button>}
      />
    </Card>
  )
}
