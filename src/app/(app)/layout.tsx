import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'

import { AppShell } from '@/components/layout/AppShell'
import { listUserClinics } from '@/lib/auth/clinics'
import { describeRole, getSessionState } from '@/lib/auth/session'
import { currentUser } from '@/lib/mocks/clinic-data'
import { ClinicSwitcher } from '@/modules/identity/ui/ClinicSwitcher'

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

/**
 * F-02 ligou `cacheComponents`, e com ela o Next passa a exigir que toda rota
 * produza um shell estatico nao vazio. Esta casca le a sessao em cookie ANTES de
 * decidir se redireciona — nao ha shell a prerenderizar, porque nem se sabe
 * ainda se a rota renderiza.
 *
 * `instant = false` e a saida documentada para adotar Cache Components de forma
 * incremental: marca o segmento como "pode bloquear" sem forcar a rota a ser
 * dinamica e sem cachear nada
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/instant.md
 * §"Disabling static shell validation" e
 * .../02-guides/migrating-to-cache-components.md §"Adopting incrementally").
 *
 * Fica aqui, na casca, e nao na raiz: `(auth)/` continua validando. Sair daqui
 * exige empurrar a leitura de sessao para dentro de `<Suspense>` em cada tela —
 * refatoracao de rota por rota, que nao e desta fatia.
 */
export const instant = false
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

  /*
   * Troca de clinica (I-03) — so com DOIS ou mais vinculos.
   *
   * Cada assinatura tem uma clinica e cada conta cria uma so, entao a maioria
   * das contas cai no `null` daqui e a casca segue mostrando o nome como texto:
   * um seletor de um item e um menu que nao decide nada. Varios vinculos chegam
   * pelo convite (I-04), que leva o profissional para a clinica de outra pessoa
   * sem tira-lo da dele.
   */
  const clinics =
    session.status === 'active' ? await listUserClinics() : []

  const clinicSwitcher =
    session.status === 'active' && clinics.length > 1 ? (
      <ClinicSwitcher
        clinics={clinics.map((clinic) => ({
          id: clinic.id,
          name: clinic.name,
          roleLabel: describeRole(clinic.role),
        }))}
        activeClinicId={session.clinicId}
      />
    ) : null

  return (
    <AppShell
      userName={identity.name}
      userRole={identity.role}
      clinicName={identity.clinicName}
      clinicSwitcher={clinicSwitcher}
    >
      {children}
    </AppShell>
  )
}
