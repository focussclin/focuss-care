import type { Metadata } from 'next'

import { ConfiguracoesScreen } from '@/modules/workspace/ui/OperationsScreens'

export const metadata: Metadata = {
  title: 'Configurações',
  description: 'Ajuste as preferências e os dados da sua clínica.',
}

export default function ConfiguracoesPage() {
  return <ConfiguracoesScreen />
}
