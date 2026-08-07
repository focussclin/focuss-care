import type { Metadata } from 'next'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/text-field'

export const metadata: Metadata = {
  title: 'Criar conta',
  description: 'Comece a organizar sua clínica com o Focuss Care.',
}

/**
 * Destino do link "Criar conta" do login.
 * Como o cadastro ainda nao tem handoff proprio, esta tela reusa os componentes do
 * design system sem propor direcao visual nova. Sera refinada quando o Codex
 * entregar SIGNUP_DESIGN.md.
 */
export default function CadastroPage() {
  return (
    <div className="flex w-full flex-col">
      <h1 className="text-display-sm font-semibold tracking-[-0.01em] text-foreground md:text-display">
        Criar conta
      </h1>
      <p className="mt-2 text-control text-muted">
        Comece a organizar a rotina da sua clínica em poucos minutos.
      </p>

      <form className="mt-7 flex flex-col gap-4">
        <TextField
          label="Nome completo"
          name="name"
          autoComplete="name"
          placeholder="Como podemos te chamar?"
        />
        <TextField
          label="E-mail"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="voce@clinica.com.br"
        />
        <TextField
          label="Senha"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="Crie uma senha"
        />

        <Button type="submit" size="lg" fullWidth>
          Criar conta
        </Button>
      </form>

      <p className="mt-8 text-center text-aux text-muted">
        Já tem uma conta?{' '}
        <Link
          href="/login"
          className="font-semibold text-link hover:underline"
        >
          Entrar
        </Link>
      </p>
    </div>
  )
}
