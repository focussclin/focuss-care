import type { Metadata } from 'next'

import { SignUpFormContainer } from '@/modules/identity/ui/SignUpForm.container'

export const metadata: Metadata = {
  title: 'Criar conta',
  description: 'Comece a organizar sua clínica com o Focuss Care.',
}

export default function CadastroPage() {
  return <SignUpFormContainer />
}
