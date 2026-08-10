import type { ReactNode } from 'react'

import { BrandMark } from '@/components/layout/BrandMark'

/**
 * Casca do portal do paciente.
 *
 * # Por que existe um grupo de rotas só para isto
 *
 * O layout de `(app)` faz, na primeira linha:
 *
 * ```ts
 * if (session.status === 'needs-onboarding') redirect('/onboarding')
 * ```
 *
 * E `needs-onboarding` é a definição exata de um paciente: sessão autenticada,
 * **zero linhas em `memberships`**. Sob `(app)`, todo paciente que abrisse o
 * portal seria mandado para a tela de criar uma clínica.
 *
 * Não dava para relaxar aquela guarda: ela é o que impede alguém autenticado
 * sem vínculo de circular pelo produto. As duas audiências precisam de cascas
 * diferentes porque as regras de acesso delas são opostas — uma exige vínculo
 * de equipe, a outra exige a ausência dele.
 *
 * # Sem menu, e sem `instant = false`
 *
 * Não há sidebar: o paciente tem duas telas, e um menu de trinta itens da
 * clínica seria, além de inútil, um mapa do que ele não pode acessar.
 *
 * A validação de shell estático continua ligada aqui — ao contrário de
 * `(app)`, que a desliga. Estas rotas leem sessão dentro da página, e não na
 * casca, então há shell a prerenderizar.
 */
export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="border-b border-border-card bg-surface px-5 py-4">
        <div className="mx-auto flex w-full max-w-[720px] items-center justify-between gap-4">
          <BrandMark size="sm" />
          <span className="text-label font-semibold tracking-[0.1em] text-muted uppercase">
            Portal do paciente
          </span>
        </div>
      </header>

      <main
        id="conteudo"
        tabIndex={-1}
        className="mx-auto w-full max-w-[720px] flex-1 px-5 py-8 outline-none"
      >
        {children}
      </main>

      <footer className="border-t border-border-card px-5 py-5">
        <p className="mx-auto w-full max-w-[720px] text-label leading-5 text-muted">
          Este portal mostra apenas suas consultas e cobranças. Prontuário e
          anotações clínicas não ficam aqui.
        </p>
      </footer>
    </div>
  )
}
