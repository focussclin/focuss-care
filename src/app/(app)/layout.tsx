import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { AppShell } from '@/components/layout/AppShell'
import { describeRole, getSessionState } from '@/lib/auth/session'
import { currentUser } from '@/lib/mocks/clinic-data'

/**
 * Casca da area autenticada.
 *
 * Aqui a sessao vira identidade de tela: nome, papel e clinica saem do banco,
 * nao mais do mock. O mock so sobrevive quando o Supabase nao esta configurado —
 * nesse caso a aplicacao inteira e uma demonstracao local, sem banco por tras.
 *
 * A checagem de vinculo acontece na renderizacao no servidor, e nao no proxy: o
 * proxy roda em toda rota (inclusive prefetch) e a doc do Next 16 recomenda
 * manter la apenas a checagem otimista de sessao. A guarda definitiva de dados
 * vive nos repositorios (src/lib/data-source.ts).
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSessionState()

  if (session.status === 'anonymous') redirect('/login')
  if (session.status === 'needs-onboarding') redirect('/onboarding')
  if (session.status === 'claims-stale') redirect('/onboarding')

  const identity =
    session.status === 'not-configured'
      ? { name: currentUser.name, role: currentUser.role, clinicName: undefined }
      : {
          name: session.user.displayName,
          role: describeRole(session.role),
          clinicName: session.clinicName ?? undefined,
        }

  return (
    <AppShell
      userName={identity.name}
      userRole={identity.role}
      clinicName={identity.clinicName}
    >
      {children}
    </AppShell>
  )
}
