import type { Metadata } from 'next'

import { PendingSection } from '@/components/layout/PendingSection'

export const metadata: Metadata = {
  title: 'Equipe',
  description: 'Gerencie os profissionais da sua clínica.',
}

export default function EquipePage() {
  return (
    <PendingSection
      eyebrow="Gestão da clínica"
      title="Equipe"
      description="Gerencie os profissionais e as permissões de acesso."
    />
  )
}
