import { AlertCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { signOutAction } from '../actions/signOut.action'

interface OnboardingSessionErrorProps {
  greetingName?: string
}

/** Estado fail-closed quando o banco tem o vínculo, mas o JWT não tem as claims. */
export function OnboardingSessionError({
  greetingName,
}: OnboardingSessionErrorProps) {
  return (
    <div className="w-full">
      <p className="text-label font-semibold tracking-[0.08em] text-muted uppercase">
        Sessão precisa de atenção
      </p>
      <h1 className="mt-1.5 text-display-sm font-semibold tracking-[-0.02em] text-foreground">
        {greetingName ? `Quase lá, ${greetingName}.` : 'Quase lá.'}
      </h1>
      <p className="mt-2 text-control text-muted">
        Sua clínica já foi criada, mas não conseguimos renovar a sessão com
        segurança. Entre novamente para continuar.
      </p>

      <div
        role="alert"
        className="mt-6 flex items-start gap-2 rounded-field border border-danger/30 bg-danger-surface px-4 py-3 text-aux text-danger"
      >
        <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>Nenhum dado da clínica será exibido enquanto a sessão não for renovada.</span>
      </div>

      <form action={signOutAction} className="mt-7">
        <Button type="submit" size="lg" fullWidth>
          Sair e entrar novamente
        </Button>
      </form>
    </div>
  )
}
