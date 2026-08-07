import type { Metadata } from 'next'

import { ChatIaScreen } from '@/modules/workspace/ui/OperationsScreens'

export const metadata: Metadata = {
  title: 'Assistente Focuss',
  description: 'Encontre informações e organize tarefas com apoio da IA.',
}

export default function ChatIaPage() {
  return <ChatIaScreen />
}
