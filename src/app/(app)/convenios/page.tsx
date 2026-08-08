import type { Metadata } from 'next'

import { ConveniosScreen } from '@/modules/workspace/ui/OperationsScreens'

export const metadata: Metadata = {
  title: 'Convênios',
  description: 'Gerencie operadoras, tabelas e guias da clínica.',
}

export default function ConveniosPage() {
  return <ConveniosScreen />
}
