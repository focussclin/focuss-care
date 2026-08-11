import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { getSessionState } from '@/lib/auth/session'
import { SignUpFormContainer } from '@/modules/identity/ui/SignUpForm.container'

export const metadata: Metadata = {
  title: 'Criar conta',
  description: 'Comece a organizar sua clínica com o Focuss Care.',
}


export default async function CadastroPage() {
  const session = await getSessionState()

  if (session.status === 'active') redirect('/dashboard')
  if (session.status === 'needs-onboarding' || session.status === 'claims-stale') {
    redirect('/onboarding')
  }

  return <SignUpFormContainer />
}
