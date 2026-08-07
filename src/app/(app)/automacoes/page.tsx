import type { Metadata } from 'next'

import { AutomacoesScreen } from '@/modules/workspace/ui/OperationsScreens'

export const metadata: Metadata = {
  title: 'Automações',
  description: 'Crie lembretes e ações para a equipe da clínica.',
}

export default function AutomacoesPage() {
  return <AutomacoesScreen />
}
