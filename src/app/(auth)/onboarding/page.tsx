import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { getSessionState } from '@/lib/auth/session'
import { OnboardingFormContainer } from '@/modules/identity/ui/OnboardingForm.container'
import { OnboardingSessionError } from '@/modules/identity/ui/OnboardingSessionError'

export const metadata: Metadata = {
  title: 'Configuração inicial',
  description: 'Configure o espaço da sua clínica no Focuss Care.',
}

/**
 * P-C2 — este segmento NAO pode sair do `instant = false`, e o motivo nao e
 * falta de fallback desenhado.
 *
 * O conserto padrao (empurrar a leitura para dentro de um `<Suspense>`) muda o
 * redirecionamento de lugar: hoje ele acontece ANTES da resposta comecar, e o
 * navegador recebe um 307 de verdade. Dentro de um boundary, a resposta ja
 * teria comecado a ser enviada e o desvio viraria navegacao no cliente. Duas
 * consequencias, as duas ruins:
 *
 *  - **Sem JavaScript, o desvio nao acontece.** Quem ja tem clinica ficaria
 *    parado numa tela de configuracao inicial que nao e mais dele. Portao de
 *    autenticacao que depende de JS nao e portao.
 *  - **Com JavaScript, pisca.** A pessoa ve a casca do onboarding e e jogada
 *    para `/dashboard` — conteudo pintado para ser descartado.
 *
 * E nao ha o que ganhar em troca: a pagina INTEIRA e a decisao de sessao. O
 * shell estatico possivel seria um esqueleto neutro, e um esqueleto antes do
 * redirecionamento e uma pintura a mais, nao uma a menos.
 *
 * `/login` saiu do `instant = false` porque nao redireciona: la o formulario e
 * o shell, e so o aviso de OAuth depende da requisicao.
 */

export default async function OnboardingPage() {
  const session = await getSessionState()

  // Sem sessao nao ha dono para a clinica; com clinica nao ha o que configurar.
  // A decisao fica no servidor, na renderizacao — o proxy so faz a checagem
  // otimista de sessao (ver docs do Next 16, "Optimistic checks with Proxy").
  if (session.status === 'anonymous') redirect('/login')
  if (session.status === 'active') redirect('/dashboard')
  if (session.status === 'claims-stale') {
    return (
      <OnboardingSessionError
        greetingName={session.user.displayName.split(' ')[0]}
      />
    )
  }
  // Sem Supabase no ambiente nao ha clinica a criar: a aplicacao roda em
  // demonstracao local e o dashboard e o destino correto.
  if (session.status === 'not-configured') redirect('/dashboard')

  const greetingName =
    session.status === 'needs-onboarding'
      ? session.user.displayName.split(' ')[0]
      : undefined

  return <OnboardingFormContainer greetingName={greetingName} />
}
