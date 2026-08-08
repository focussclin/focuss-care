import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { getSessionState } from '@/lib/auth/session'
import { AcceptInvitation } from '@/modules/identity/ui/AcceptInvitation'

export const metadata: Metadata = {
  title: 'Convite',
  description: 'Aceite o convite para participar de uma clínica.',
  // Um link de convite carrega um token de acesso. Indexar seria publicá-lo.
  robots: { index: false, follow: false },
}

/**
 * Aceite de convite — I-04.
 *
 * A rota vive em `(auth)` e não em `(app)`: quem chega aqui pode não ter sessão,
 * e a casca autenticada redirecionaria para o login perdendo o token no caminho.
 *
 * Sem sessão, o destino é o login **com `next` apontando de volta para cá** —
 * assim o token sobrevive ao desvio e a pessoa cai direto no aceite depois de
 * entrar. É o mesmo motivo pelo qual o convite não é aceito automaticamente:
 * quem decide é a pessoa, não a navegação.
 */
/**
 * `cacheComponents` (F-02) exige que toda rota produza um shell estático não
 * vazio. Esta lê a sessão em cookie ANTES de decidir se redireciona — não há
 * shell a prerenderizar, porque nem se sabe ainda se a rota renderiza.
 *
 * `instant = false` é a saída documentada para adoção incremental: marca o
 * segmento como "pode bloquear", sem forçar a rota a ser dinâmica e sem cachear
 * nada. Mesmo tratamento já dado à casca de `(app)` — é a pendência P-C2, agora
 * com um segmento a mais.
 */
export const instant = false

export default async function ConvitePage({
  params,
}: PageProps<'/convite/[token]'>) {
  const { token } = await params
  const session = await getSessionState()

  if (session.status === 'anonymous') {
    redirect(`/login?next=${encodeURIComponent(`/convite/${token}`)}`)
  }

  /*
   * `needs-onboarding` NÃO vai para o onboarding aqui.
   *
   * Quem foi convidado e ainda não tem clínica está exatamente no caminho certo:
   * aceitar o convite é o que vai lhe dar a primeira clínica. Mandá-lo criar uma
   * própria seria empurrá-lo a abrir uma clínica que ele não queria — e, pela
   * regra de uma clínica por conta, isso o impediria de criar a dele depois.
   */

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-2">
        <p className="text-label font-semibold tracking-[0.08em] text-link uppercase">
          Convite
        </p>
        <h1 className="text-h1 font-semibold tracking-[-0.02em] text-foreground">
          Você foi convidado para uma clínica
        </h1>
      </div>

      <AcceptInvitation token={token} />
    </div>
  )
}
