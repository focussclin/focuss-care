import type { Metadata } from 'next'

import { WhatsappScreen } from '@/modules/workspace/ui/OperationsScreens'

export const metadata: Metadata = {
  title: 'WhatsApp',
  description: 'Organize as conversas da clínica em um só lugar.',
}

export default function WhatsappPage() {
  return <WhatsappScreen />
}
