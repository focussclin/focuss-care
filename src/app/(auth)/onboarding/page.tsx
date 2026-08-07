import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { getSessionState } from '@/lib/auth/session'
import { OnboardingFormContainer } from '@/modules/identity/ui/OnboardingForm.container'
import { OnboardingSessionError } from '@/modules/identity/ui/OnboardingSessionError'

export const metadata: Metadata = {
  title: 'Configuração inicial',
  description: 'Configure o espaço da sua clínica no Focuss Care.',
}

export default async function OnboardingPage() {
  const session = await getSessionState()

  // Sem sessao nao ha dono para a clinica; com clinica nao ha o que configurar.
  // A decisao fica no servidor, na renderizacao — o proxy so faz a checagem
  // otimista de sessao (ver docs do Next 16, "Optimistic checks with Proxy").
  if (session.status === 'anonymous') redirect('/login')
  if (session.status === 'active') redirect('/dashboard')
  if (session.status === 'claims-stale') {
    return (
      <OnboardingSessionError
        greetingName={session.user.displayName.split(' ')[0]}
      />
    )
  }
  // Sem Supabase no ambiente nao ha clinica a criar: a aplicacao roda em
  // demonstracao local e o dashboard e o destino correto.
  if (session.status === 'not-configured') redirect('/dashboard')

  const greetingName =
    session.status === 'needs-onboarding'
      ? session.user.displayName.split(' ')[0]
      : undefined

  return <OnboardingFormContainer greetingName={greetingName} />
}
