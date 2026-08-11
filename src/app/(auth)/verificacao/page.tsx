import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'

import { safeNextPath } from '@/lib/routes/safeNextPath'
import { requiresSecondFactor } from '@/lib/security/mfa'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { listFactors } from '@/modules/identity/actions/mfa.action'
import { mfaMessages } from '@/modules/identity/schemas/mfa.schema'
import { SecondFactorForm } from '@/modules/identity/ui/SecondFactorForm'

export const metadata: Metadata = {
  title: 'Verificação em duas etapas',
  description: 'Confirme o código do seu aplicativo autenticador.',
}

/**
 * P-C2 — este segmento NÃO pode sair do `instant = false`.
 *
 * A página inteira é uma decisão de sessão que termina em `redirect`: quem já
 * verificou, ou não tem fator, é mandado adiante antes de qualquer render.
 * Dentro de `<Suspense>` o desvio deixaria de ser 307 e passaria a depender de
 * JavaScript — e este é o portão que separa uma sessão `aal1` do prontuário.
 *
 * Mesma razão registrada para `/onboarding` e `/convite/[token]`.
 */

/**
 * A segunda etapa do login — feature **S-MFA**.
 *
 * Fica em `(auth)`, e não em `(app)`: a casca do aplicativo devolve para cá quem
 * ainda não apresentou o fator, e uma tela dentro dela redirecionaria para si
 * mesma para sempre.
 *
 * # Quem chega aqui sem precisar é mandado adiante
 *
 * Sessão já verificada, ou conta sem fator cadastrado, não tem o que fazer nesta
 * página — e deixá-la aberta seria um campo de código que nunca vai ser aceito.
 * O desvio usa o mesmo `safeNextPath` do login: o destino vem da URL e é
 * decidido no servidor.
 */
export default async function VerificacaoPage({
  searchParams,
}: PageProps<'/verificacao'>) {
  await connection()

  const { next } = await searchParams
  const destination = safeNextPath(typeof next === 'string' ? next : undefined)

  const supabase = await createSupabaseServerClient()
  if (!supabase) redirect('/login')

  const { data: assurance } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

  if (!requiresSecondFactor(assurance ?? { currentLevel: null, nextLevel: null })) {
    redirect(destination)
  }

  const { active, unavailable } = await listFactors()

  return (
    <div className="flex w-full flex-col">
      <h1 className="text-display-sm font-semibold tracking-[-0.01em] text-foreground md:text-display">
        Verificação em duas etapas
      </h1>
      <p className="mt-2 text-control text-muted">
        Sua conta pede um código do aplicativo autenticador para concluir a
        entrada.
      </p>

      {unavailable ? (
        <p role="alert" className="mt-6 text-control text-danger">
          {mfaMessages.listUnavailable}
        </p>
      ) : null}

      <SecondFactorForm
        factors={active.map((factor) => ({
          id: factor.id,
          friendlyName: factor.friendlyName,
        }))}
        next={destination}
      />
    </div>
  )
}
