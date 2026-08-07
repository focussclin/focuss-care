import type { Metadata } from 'next'

import { LoginFormContainer } from '@/modules/identity/ui/LoginForm.container'

export const metadata: Metadata = {
  title: 'Entrar · Focuss Care',
  description:
    'Acesse sua conta do Focuss Care e continue de onde parou.',
}

export default function LoginPage() {
  return <LoginFormContainer />
}
