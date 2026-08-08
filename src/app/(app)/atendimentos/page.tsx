import type { Metadata } from 'next'

import { AtendimentosScreen } from '@/modules/workspace/ui/OperationsScreens'

export const metadata: Metadata = {
  title: 'Atendimentos',
  description: 'Acompanhe a fila e o andamento dos atendimentos da clínica.',
}

export default function AtendimentosPage() {
  return <AtendimentosScreen />
}
