'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Menu } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { BrandMark } from './BrandMark'
import { SidebarNav } from './SidebarNav'

export interface AppShellProps {
  userName: string
  userRole: string
  children: ReactNode
}

/**
 * Casca da area autenticada.
 *
 * Faixas de responsividade (DASHBOARD_DESIGN.md, secao "Responsividade"):
 *  - ate 767px  -> barra superior com marca e botao de menu; navegacao em drawer
 *  - 768–1099px -> sidebar reduzida de 80px, so icones com tooltip
 *  - 1100px+    -> sidebar completa de 248px
 */
export function AppShell({ userName, userRole, children }: AppShellProps) {
  const [drawerOpen, setDrawerOpen] = useState(false)

  return (
    <div className="min-h-dvh bg-background">
      {/* Sidebar fixa — a partir de 768px */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-20 md:block nav:w-[248px]">
        <div className="hidden h-full md:block nav:hidden">
          <SidebarNav userName={userName} userRole={userRole} variant="rail" />
        </div>
        <div className="hidden h-full nav:block">
          <SidebarNav userName={userName} userRole={userRole} variant="full" />
        </div>
      </aside>

      {/* Barra superior — apenas mobile */}
      <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border-card bg-surface px-5 md:hidden">
        <BrandMark size="sm" />

        <DialogPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DialogPrimitive.Trigger
            aria-label="Abrir menu de navegação"
            className="inline-flex size-11 items-center justify-center rounded-field text-foreground transition-colors hover:bg-row-hover"
          >
            <Menu aria-hidden className="size-5" strokeWidth={1.75} />
          </DialogPrimitive.Trigger>

          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-[#1c2b25]/40" />
            <DialogPrimitive.Content
              aria-label="Navegação principal"
              className="fixed inset-y-0 left-0 z-50 w-[272px] max-w-[85vw] shadow-raised outline-none"
            >
              <DialogPrimitive.Title className="sr-only">
                Navegação principal
              </DialogPrimitive.Title>
              <SidebarNav
                userName={userName}
                userRole={userRole}
                variant="drawer"
                onNavigate={() => setDrawerOpen(false)}
              />
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      </header>

      {/* Conteudo: padding 20–24px no mobile, 32px no desktop */}
      <div className="md:pl-20 nav:pl-[248px]">
        <main className="px-5 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  )
}
