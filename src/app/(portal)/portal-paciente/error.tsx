'use client'

import { AlertTriangle } from 'lucide-react'
import { useEffect } from 'react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'

/**
 * Erro do portal do paciente.
 *
 * Texto SEM jargão de sistema: quem lê não é da clínica e não tem a quem
 * perguntar sobre "migration" ou "policy". O que ele precisa saber é que o
 * problema não é dele e que a clínica resolve.
 */
export default function PortalPacienteError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error('[portal-paciente] render interrompido', {
      digest: error.digest,
      name: error.name,
    })
  }, [error])

  return (
    <Card>
      <EmptyState
        icon={AlertTriangle}
        title="Não foi possível carregar seus dados agora."
        description="Tente de novo em instantes. Se continuar, fale com a recepção da clínica."
        action={<Button onClick={retry}>Tentar novamente</Button>}
      />
    </Card>
  )
}
