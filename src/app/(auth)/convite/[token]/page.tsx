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
 *
 * Esta frase foi **falsa até 08/08/2026**: o `next` era escrito aqui e ignorado
 * pelo login, que sempre terminava em `/dashboard`. Quem era convidado entrava,
 * caía no painel e precisava achar o e-mail de novo — e o link de convite vale
 * uma vez. Quem faz valer agora é `src/lib/routes/safeNextPath.ts`, que valida o
 * destino no servidor, tanto na entrada por senha quanto no retorno do Google.
 */
/**
 * P-C2 — este segmento **permanece** com `instant = false`, pelo mesmo motivo
 * de `/onboarding`: a rota lê a sessão para decidir se redireciona.
 *
 * Empurrar essa leitura para dentro de um `<Suspense>` faria o desvio deixar de
 * ser um 307 e virar navegação no cliente. Aqui o caso é ainda mais concreto que
 * no onboarding: quem chega sem sessão precisa ir para o login **com o `next`
 * carregando o token**, e é esse desvio que faz o convite sobreviver ao login.
 * Se ele depender de JavaScript, um visitante sem JS fica numa tela de convite
 * que nunca vai conseguir aceitar — e o link, que costuma vir de e-mail e é
 * usado uma vez, se perde.
 *
 * O que se ganharia em troca é pequeno: o shell seria o título "Você foi
 * convidado", pintado antes de saber se a pessoa sequer pode aceitar.
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
