import type { Metadata } from 'next'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/text-field'

export const metadata: Metadata = {
  title: 'Recuperar senha',
  description: 'Enviamos um link para você voltar a acessar sua conta.',
}

/**
 * Etapa seguinte do fluxo de login. Existe para cumprir o requisito de
 * LOGIN_DESIGN.md: "o link de recuperacao deve preservar o e-mail preenchido".
 * O layout visual completo desta tela ainda depende de handoff proprio do Codex —
 * aqui reusamos os componentes ja definidos, sem inventar direcao nova.
 */
/** Mesmo motivo de `/login`: `searchParams` no topo, sem shell estatico (F-02). */
export const instant = false

export default async function RecuperarSenhaPage({
  searchParams,
}: PageProps<'/recuperar-senha'>) {
  const { email } = await searchParams
  const prefilledEmail = typeof email === 'string' ? email : ''

  return (
    <div className="flex w-full flex-col">
      <h1 className="text-display-sm font-semibold tracking-[-0.01em] text-foreground md:text-display">
        Recuperar senha
      </h1>
      <p className="mt-2 text-control text-muted">
        Informe seu e-mail e enviaremos um link para você criar uma nova senha.
      </p>

      <form className="mt-7 flex flex-col gap-4">
        <TextField
          label="E-mail"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={prefilledEmail}
          placeholder="voce@clinica.com.br"
        />

        <Button type="submit" size="lg" fullWidth>
          Enviar link de recuperação
        </Button>
      </form>

      <p className="mt-8 text-center text-aux text-muted">
        Lembrou sua senha?{' '}
        <Link
          href="/login"
          className="font-semibold text-link hover:underline"
        >
          Voltar para o login
        </Link>
      </p>
    </div>
  )
}
