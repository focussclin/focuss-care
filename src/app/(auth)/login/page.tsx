import type { Metadata } from 'next'

import { LoginFormContainer } from '@/modules/identity/ui/LoginForm.container'

export const metadata: Metadata = {
  title: 'Entrar · Focuss Care',
  description:
    'Acesse sua conta do Focuss Care e continue de onde parou.',
}

export default async function LoginPage({
  searchParams,
}: PageProps<'/login'>) {
  const { error, next } = await searchParams

  return (
    <LoginFormContainer
      oauthError={typeof error === 'string' ? error : undefined}
      nextPath={typeof next === 'string' ? next : undefined}
    />
  )
}
