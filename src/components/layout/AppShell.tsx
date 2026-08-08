'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { cn } from '@/lib/utils/cn'

import { AppHeader } from './AppHeader'
import { SidebarNav } from './SidebarNav'

export interface AppShellProps {
  userName: string
  userRole: string
  /** Clinica ativa da sessao. Ausente no modo de demonstracao local. */
  clinicName?: string
  /**
   * Seletor de clinica, quando ha mais de um vinculo (I-03).
   *
   * Chega como slot, e nao como lista de clinicas, para que o design system nao
   * precise conhecer `memberships` nem a Server Action que troca de tenant —
   * `components/` nao importa `modules/`.
   */
  clinicSwitcher?: ReactNode
  children: ReactNode
}

export function AppShell({
  userName,
  userRole,
  clinicName,
  clinicSwitcher,
  children,
}: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  return (
    <DialogPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
      <div className="min-h-dvh bg-background">
        <aside
          className={cn(
            'fixed inset-y-0 left-0 z-40 hidden border-r border-white/5 transition-[width] duration-200 md:block',
            sidebarCollapsed ? 'w-20' : 'w-[272px]',
          )}
        >
          <SidebarNav
            userName={userName}
            userRole={userRole}
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
            onMenuClick={() => setDrawerOpen(true)}
          />
          <main className="mx-auto w-full max-w-[1680px] px-4 py-6 sm:px-6 md:py-8 lg:px-8 xl:px-10">
            {children}
          </main>
        </div>

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
              variant="drawer"
              onNavigate={() => setDrawerOpen(false)}
            />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </div>
    </DialogPrimitive.Root>
  )
}
