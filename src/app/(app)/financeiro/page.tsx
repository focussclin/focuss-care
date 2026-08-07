import type { Metadata } from 'next'

import { FinanceiroScreen } from '@/modules/workspace/ui/OperationsScreens'

export const metadata: Metadata = {
  title: 'Financeiro',
  description: 'Acompanhe receitas, despesas e recebimentos da clínica.',
}

export default function FinanceiroPage() {
  return <FinanceiroScreen />
}
