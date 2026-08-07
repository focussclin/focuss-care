import type { Metadata } from 'next'

import { EquipeScreen } from '@/modules/workspace/ui/OperationsScreens'

export const metadata: Metadata = {
  title: 'Equipe',
  description: 'Gerencie os profissionais e as permissões de acesso.',
}

export default function EquipePage() {
  return <EquipeScreen />
}
