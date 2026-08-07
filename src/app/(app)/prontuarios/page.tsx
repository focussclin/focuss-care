import type { Metadata } from 'next'

import { ProntuariosScreen } from '@/modules/workspace/ui/OperationsScreens'

export const metadata: Metadata = {
  title: 'Prontuários',
  description: 'Acesse evoluções e documentos protegidos dos pacientes.',
}

export default function ProntuariosPage() {
  return <ProntuariosScreen />
}
