'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useCallback, useState, type ReactNode } from 'react'

import type { MembershipRole } from '@/lib/supabase/database.types'
import { cn } from '@/lib/utils/cn'

import { AppHeader } from './AppHeader'
import {
  CommandPalette,
  useCommandPaletteShortcut,
} from './CommandPalette'
import { SidebarNav } from './SidebarNav'

export interface AppShellProps {
  userName: string
  userRole: string
  /**
   * Papel na clinica ativa (I-05), para o menu nao oferecer o que o papel nao
   * alcanca. `undefined` no modo de demonstracao, onde nao ha vinculo.
   */
  role?: MembershipRole | null
  /** Clinica ativa da sessao. Ausente no modo de demonstracao local. */
  clinicName?: string
  notificationSlot?: ReactNode
  /**
   * Seletor de clinica, quando ha mais de um vinculo (I-03).
   *
   * Chega como slot, e nao como lista de clinicas, para que o design system nao
   * precise conhecer `memberships` nem a Server Action que troca de tenant —
   * `components/` nao importa `modules/`.
   */
  clinicSwitcher?: ReactNode
  /**
   * Aviso sobre o estado COMERCIAL da clinica (C-ST).
   *
   * Chega como texto pronto, e nao como o enum: `components/` nao conhece
   * `clinics.status` nem decide o que cada estado significa — quem decide e
   * `lib/clinic/clinic-status.ts`. `undefined` e o caso normal, e nao ha banner.
   */
  clinicNotice?: string
  children: ReactNode
}

export function AppShell({
  userName,
  userRole,
  role,
  clinicName,
  clinicSwitcher,
  notificationSlot,
  clinicNotice,
  children,
}: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [commandsOpen, setCommandsOpen] = useState(false)

  /*
   * O atalho vive AQUI, e nao dentro da paleta: ele precisa funcionar com ela
   * fechada, entao pertence a quem a monta.
   */
  useCommandPaletteShortcut(useCallback(() => setCommandsOpen(true), []))

  return (
    <DialogPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
      <div className="min-h-dvh bg-background">
        {/*
          Pular para o conteúdo — primeiro elemento focável da página.

          A sidebar renderiza até 31 itens antes do `<main>`. Sem este link,
          quem navega por teclado atravessa o menu inteiro A CADA TROCA DE
          PÁGINA para chegar no que veio ver. Não é desconforto: numa recepção,
          é a diferença entre atender e esperar.

          `sr-only focus:not-sr-only` é o padrão: invisível até receber foco, e
          aí aparece ancorado no topo. O `<main>` tem `tabIndex={-1}` porque
          elemento não focável não recebe foco por âncora — o navegador rolaria
          até ele e deixaria o foco para trás, no menu.
        */}
        <a
          href="#conteudo"
          className="sr-only rounded-field bg-surface px-4 py-3 text-aux font-semibold text-link shadow-raised focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[60] focus:outline-none focus:shadow-focus"
        >
          Pular para o conteúdo
        </a>

        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-40 hidden border-r border-white/5 transition-[width] duration-200 md:block',
            sidebarCollapsed ? 'w-20' : 'w-[272px]',
          )}
        >
          <SidebarNav
            userName={userName}
            userRole={userRole}
            role={role}
            variant={sidebarCollapsed ? 'rail' : 'full'}
            onToggleCollapse={() => setSidebarCollapsed((value) => !value)}
          />
        </aside>

        <div
          className={cn(
            'min-h-dvh transition-[padding-left] duration-200',
            sidebarCollapsed ? 'md:pl-20' : 'md:pl-[272px]',
          )}
        >
          <AppHeader
            userName={userName}
            userRole={userRole}
            clinicName={clinicName}
            clinicSwitcher={clinicSwitcher}
            notificationSlot={notificationSlot}
            onMenuClick={() => setDrawerOpen(true)}
            onOpenCommands={() => setCommandsOpen(true)}
          />
          <main
            id="conteudo"
            tabIndex={-1}
            className="mx-auto w-full max-w-[1680px] px-4 py-6 outline-none sm:px-6 md:py-8 lg:px-8 xl:px-10"
          >
            {/*
              O aviso fica DENTRO do main, acima do conteudo, e nao numa faixa
              fixa no topo: preso ao topo ele cobriria a barra em telas
              pequenas, e some do campo de visao justamente de quem rola a
              pagina para trabalhar.
            */}
            {clinicNotice ? (
              <p
                role="status"
                className="mb-6 rounded-card border border-attention/30 bg-attention-surface px-4 py-3 text-aux text-attention"
              >
                {clinicNotice}
              </p>
            ) : null}

            {children}
          </main>
        </div>

        {/*
          A paleta recebe o mesmo `role` do menu: os dois oferecem o mesmo
          conjunto de rotas, e divergir faria a paleta ser o atalho para
          justamente o que o menu esconde.
        */}
        <CommandPalette
          open={commandsOpen}
          onOpenChange={setCommandsOpen}
          role={role}
        />

        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[#071f3b]/35 backdrop-blur-[2px] md:hidden" />
          <DialogPrimitive.Content
            aria-label="Navegação principal"
            className="fixed inset-y-0 left-0 z-50 w-[292px] max-w-[88vw] bg-brand shadow-raised outline-none md:hidden"
          >
            <DialogPrimitive.Title className="sr-only">Navegação principal</DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                aria-label="Fechar menu"
                className="absolute top-4 right-4 z-10 inline-flex size-9 items-center justify-center rounded-lg bg-white/10 text-white/80 transition-colors hover:bg-white/16 hover:text-white"
              >
                <X aria-hidden className="size-[18px]" />
              </button>
            </DialogPrimitive.Close>
            <SidebarNav
              userName={userName}
              userRole={userRole}
              role={role}
              variant="drawer"
              onNavigate={() => setDrawerOpen(false)}
            />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </div>
    </DialogPrimitive.Root>
  )
}
