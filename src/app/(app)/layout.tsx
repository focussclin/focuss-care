import { redirect, unauthorized } from 'next/navigation'
import type { ReactNode } from 'react'

import { AppShell } from '@/components/layout/AppShell'
import { listUserClinics } from '@/lib/auth/clinics'
import { describeRole, getSessionState } from '@/lib/auth/session'
import { currentUser } from '@/lib/mocks/clinic-data'
import { ClinicSwitcher } from '@/modules/identity/ui/ClinicSwitcher'
import { toNotificationDto } from '@/modules/notifications/application/toNotificationDto'
import { getNotificationRepository } from '@/modules/notifications/infrastructure/repository'
import { NotificationCenter } from '@/modules/notifications/ui/NotificationCenter'
import type { Notification } from '@/modules/notifications/domain/Notification'

/**
 * Casca da area autenticada.
 *
 * Aqui a sessao vira identidade de tela: nome, papel e clinica saem do banco,
 * nao mais do mock. O mock so sobrevive quando o Supabase nao esta configurado —
 * nesse caso a aplicacao inteira e uma demonstracao local, sem banco por tras.
 *
 * A checagem de vinculo acontece na renderizacao no servidor, e nao no proxy: o
 * proxy roda em toda rota (inclusive prefetch) e a doc do Next 16 recomenda
 * manter la apenas a checagem otimista de sessao. A guarda definitiva de dados
 * vive nos repositorios (src/lib/data-source.ts).
 */

/**
 * F-02 ligou `cacheComponents`, e com ela o Next passa a exigir que toda rota
 * produza um shell estatico nao vazio. Esta casca le a sessao em cookie ANTES de
 * decidir se redireciona — nao ha shell a prerenderizar, porque nem se sabe
 * ainda se a rota renderiza.
 *
 * `instant = false` e a saida documentada para adotar Cache Components de forma
 * incremental: marca o segmento como "pode bloquear" sem forcar a rota a ser
 * dinamica e sem cachear nada
 * (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/instant.md
 * §"Disabling static shell validation" e
 * .../02-guides/migrating-to-cache-components.md §"Adopting incrementally").
 *
 * Fica aqui, na casca, e nao na raiz: `(auth)/` continua validando. Sair daqui
 * exige empurrar a leitura de sessao para dentro de `<Suspense>` em cada tela —
 * refatoracao de rota por rota, que nao e desta fatia.
 *
 * # Este `false` cobre TODAS as paginas abaixo (P-C2, reducao de divida)
 *
 * Nove paginas de `(app)` declaravam o proprio `instant = false`, e as nove
 * eram redundantes: a doc do Next diz que, para a validacao de shell estatico,
 * **o `false` mais alto da arvore prevalece sobre qualquer `true` mais fundo** —
 * e o build confirma (removidas as nove, ele continua passando).
 *
 * A recomendacao da propria doc e colocar o `false` o mais baixo possivel para
 * que o resto do app continue validando. Aqui o mais baixo possivel e esta
 * casca: toda rota sob ela le sessao em cookie antes de decidir se renderiza.
 * Espalhar a declaracao por nove arquivos nao reduzia nada e escondia o fato de
 * que a divida e UMA, e mora aqui.
 *
 * Ver node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
 * 02-route-segment-config/instant.md §"Disabling static shell validation".
 */
export const instant = false
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await getSessionState()

  /*
   * Sem sessao: `unauthorized()`, e nao `redirect('/login')`.
   *
   * O desvio para `/login` PERDIA O DESTINO. Quando o `proxy.ts` existia, era
   * ele quem escrevia `/login?next=<rota>`; com a migracao para Cloudflare
   * Workers o proxy saiu, e a casca passou a mandar todo mundo para um `/login`
   * pelado. Consequencia: quem abre um link salvo de `/pacientes/<id>`, ou um
   * link mandado no WhatsApp da clinica, entra e cai no painel — e precisa
   * procurar de novo o que ja tinha em maos.
   *
   * `unauthorized()` nao navega: interrompe a renderizacao e serve
   * `app/unauthorized.tsx` NA MESMA URL. O endereco continua sendo
   * `/pacientes/<id>`, entao o destino nao se perde — e e a propria pagina de
   * 401 que o carrega para o login.
   *
   * **O que NAO muda: o status HTTP.** Medido em `next build` + `next start`,
   * antes e depois: sob `cacheComponents` a resposta ja saia 200, com o desvio
   * acontecendo no cliente. O 401 aparece no `dev`, e nao no build de producao.
   * Trocar o portao nao piorou nem melhorou isso; quem quiser status honesto
   * precisa mover a decisao para fora da renderizacao, e ai volta a discussao
   * do middleware que saiu com a migracao para Workers.
   *
   * `needs-onboarding` e `claims-stale` continuam redirecionando: ali ha sessao
   * valida, e o problema nao e entrar — e nao ter clinica. Manter o 401 nesses
   * casos diria "sua sessao expirou" a quem acabou de entrar.
   */
  if (session.status === 'anonymous') unauthorized()
  if (session.status === 'needs-onboarding') redirect('/onboarding')
  if (session.status === 'claims-stale') redirect('/onboarding')

  const identity =
    session.status === 'not-configured'
      ? { name: currentUser.name, role: currentUser.role, clinicName: undefined }
      : {
          name: session.user.displayName,
          role: describeRole(session.role),
          clinicName: session.clinicName ?? undefined,
        }

  /*
   * Troca de clinica (I-03) — so com DOIS ou mais vinculos.
   *
   * Cada assinatura tem uma clinica e cada conta cria uma so, entao a maioria
   * das contas cai no `null` daqui e a casca segue mostrando o nome como texto:
   * um seletor de um item e um menu que nao decide nada. Varios vinculos chegam
   * pelo convite (I-04), que leva o profissional para a clinica de outra pessoa
   * sem tira-lo da dele.
   */
  const clinics =
    session.status === 'active' ? await listUserClinics() : []

  const clinicSwitcher =
    session.status === 'active' && clinics.length > 1 ? (
      <ClinicSwitcher
        clinics={clinics.map((clinic) => ({
          id: clinic.id,
          name: clinic.name,
          roleLabel: describeRole(clinic.role),
        }))}
        activeClinicId={session.clinicId}
      />
    ) : null

  let notificationSlot: ReactNode | undefined
  if (session.status === 'active') {
    let notificationData:
      | { notifications: Notification[]; unreadCount: number }
      | undefined

    try {
      const repository = await getNotificationRepository()
      if (repository) {
        const [notifications, unreadCount] = await Promise.all([
          repository.listForUser(session.clinicId, session.user.id, 20),
          repository.countUnread(session.clinicId, session.user.id),
        ])

        notificationData = { notifications, unreadCount }
      }
    } catch (cause) {
      console.error('[app] notificacoes indisponiveis', {
        kind: cause instanceof Error ? cause.name : typeof cause,
      })
    }

    if (notificationData) {
      notificationSlot = (
        <NotificationCenter
          notifications={notificationData.notifications.map(toNotificationDto)}
          unreadCount={notificationData.unreadCount}
        />
      )
    }
  }

  return (
    <AppShell
      userName={identity.name}
      userRole={identity.role}
      /*
       * O papel filtra o menu (I-05: nao oferecer o que nao funciona).
       *
       * `undefined` no modo de demonstracao — la nao ha vinculo, e a
       * demonstracao existe para mostrar a interface inteira. Nas rotas, a
       * autorizacao continua sendo feita por `forbidden()`.
       */
      role={session.status === 'active' ? session.role : undefined}
      clinicName={identity.clinicName}
      clinicSwitcher={clinicSwitcher}
      notificationSlot={notificationSlot}
    >
      {children}
    </AppShell>
  )
}
