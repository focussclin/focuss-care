import type { Metadata } from 'next'

import { PendingSection } from '@/components/layout/PendingSection'

export const metadata: Metadata = {
  title: 'Relatórios',
  description: 'Acompanhe os indicadores da sua clínica.',
}

export default function RelatoriosPage() {
  return (
    <PendingSection
      eyebrow="Gestão da clínica"
      title="Relatórios"
      description="Acompanhe os indicadores de atendimento e financeiro."
    />
  )
}
