import type { Metadata } from 'next'

import { PendingSection } from '@/components/layout/PendingSection'

export const metadata: Metadata = {
  title: 'Configurações',
  description: 'Ajuste as preferências da sua clínica.',
}

export default function ConfiguracoesPage() {
  return (
    <PendingSection
      eyebrow="Gestão da clínica"
      title="Configurações"
      description="Ajuste as preferências e os dados da sua clínica."
    />
  )
}
