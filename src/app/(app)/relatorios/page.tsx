import type { Metadata } from 'next'

import { RelatoriosScreen } from '@/modules/workspace/ui/OperationsScreens'

export const metadata: Metadata = {
  title: 'Relatórios',
  description: 'Acompanhe os indicadores de atendimento e financeiro.',
}

export default function RelatoriosPage() {
  return <RelatoriosScreen />
}
