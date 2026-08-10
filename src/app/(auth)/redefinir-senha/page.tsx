import type { Metadata } from 'next'
import Link from 'next/link'
import { Suspense } from 'react'

import { getSessionState } from '@/lib/auth/session'
import { NewPasswordForm } from '@/modules/identity/ui/NewPasswordForm'
import { passwordRecoveryMessages } from '@/modules/identity/schemas/passwordRecovery.schema'

export const metadata: Metadata = {
  title: 'Criar nova senha',
  description: 'Defina a nova senha da sua conta do Focuss Care.',
  // O link chega por e-mail e abre uma sessão. Indexar seria publicar o caminho.
  robots: { index: false, follow: false },
}

/**
 * Nova senha — destino do link de recuperação (**P-RS**).
 *
 * # Como se chega aqui
 *
 * `/recuperar-senha` pede o link → o Supabase manda o e-mail → o link volta em
 * `/auth/callback?next=/redefinir-senha`, que troca o `code` por sessão → cai
 * aqui, autenticado. Nenhum passo novo de infraestrutura: o callback e a DAL de
 * sessão são os que já existiam, e `/redefinir-senha` já estava na allowlist dos
 * dois desde antes desta fatia.
 *
 * # Por que a rota é pública no proxy, e a checagem é aqui
 *
 * Quem abre um link expirado chega **sem** sessão. Se o proxy o mandasse para o
 * login, a pessoa veria "entre na sua conta" — a tela que ela não consegue usar,
 * já que o problema é justamente não saber a senha. Deixando a rota passar, esta
 * página explica o que houve e oferece o caminho de pedir outro link.
 *
 * # Por que NÃO tem `instant = false`
 *
 * Diferente de `/onboarding` e `/convite`, esta página não redireciona: a
 * decisão de sessão escolhe entre dois conteúdos, e os dois são renderizáveis.
 * Então a casca (título e explicação) prerenderiza, e só o miolo — que depende
 * do cookie — chega dentro do `<Suspense>`. Não há campo no fallback, então não
 * há o risco de remontagem que manteve `/recuperar-senha` fora disso: o
 * formulário só existe depois que a sessão foi confirmada.
 */
export default function RedefinirSenhaPage() {
  return (
    <div className="flex w-full flex-col">
      <h1 className="text-display-sm font-semibold tracking-[-0.01em] text-foreground md:text-display">
        Criar nova senha
      </h1>
      <p className="mt-2 text-control text-muted">
        Escolha uma senha que você ainda não usa em outro lugar.
      </p>

      <Suspense
        fallback={
          <p role="status" className="mt-7 text-control text-muted">
            Verificando o link…
          </p>
        }
      >
        <RecoverySessionGate />
      </Suspense>

      <p className="mt-8 text-center text-aux text-muted">
        <Link href="/login" className="font-semibold text-link hover:underline">
          Voltar para o login
        </Link>
      </p>
    </div>
  )
}

/**
 * O link abriu sessão?
 *
 * `getSessionState()` é a mesma DAL que a casca autenticada usa — não há uma
 * segunda leitura de sessão nascendo aqui. Qualquer estado que não seja
 * `anonymous` significa que o link valeu: para trocar a senha basta haver
 * usuário, e ter ou não clínica não muda nada.
 *
 * `not-configured` (ambiente sem Supabase) cai no mesmo lado de fora: sem
 * provedor não há senha a trocar, e mostrar o formulário criaria um botão que
 * nunca salva.
 */
async function RecoverySessionGate() {
  const session = await getSessionState()

  if (session.status === 'anonymous' || session.status === 'not-configured') {
    return (
      <div
        role="alert"
        className="mt-7 flex flex-col gap-4 rounded-card border border-attention/30 bg-attention-surface px-4 py-4 text-aux text-foreground"
      >
        <p>{passwordRecoveryMessages.linkInvalid}</p>

        <Link
          href="/recuperar-senha"
          className="font-semibold text-link hover:underline"
        >
          Pedir um novo link
        </Link>
      </div>
    )
  }

  return <NewPasswordForm />
}
