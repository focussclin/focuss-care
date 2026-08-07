import type { ReactNode } from 'react'

import { AppShell } from '@/components/layout/AppShell'
import { currentUser } from '@/lib/mocks/clinic-data'

/**
 * Area autenticada. Quando o Supabase Auth entrar, o usuario vem da sessao
 * (e quem nao tiver sessao e barrado antes, no src/proxy.ts).
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell userName={currentUser.name} userRole={currentUser.role}>
      {children}
    </AppShell>
  )
}
