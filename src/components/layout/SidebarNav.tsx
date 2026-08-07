'use client'

import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { LogOut } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils/cn'

import { BrandMark } from './BrandMark'
import { navItems } from './navigation'

export interface SidebarNavProps {
  userName: string
  userRole: string
  /**
   * 'rail' mostra apenas icones com tooltip (768–1100px).
   * 'full' mostra icone + rotulo. 'drawer' e a versao do menu mobile.
   */
  variant: 'full' | 'rail' | 'drawer'
  onNavigate?: () => void
}

export function SidebarNav({
  userName,
  userRole,
  variant,
  onNavigate,
}: SidebarNavProps) {
  const pathname = usePathname()
  const collapsed = variant === 'rail'

  return (
    <TooltipPrimitive.Provider delayDuration={200}>
      <div className="flex h-full flex-col bg-brand">
        <div
          className={cn(
            'flex h-16 shrink-0 items-center',
            collapsed ? 'justify-center px-2' : 'px-5',
          )}
        >
          {collapsed ? (
            <span aria-hidden className="block size-2.5 rounded-full bg-brand-accent" />
          ) : (
            <BrandMark tone="light" />
          )}
          <span className="sr-only">Focuss Care</span>
        </div>

        <nav
          aria-label="Navegação principal"
          className={cn('flex-1 overflow-y-auto py-2', collapsed ? 'px-2' : 'px-3')}
        >
          <ul className="flex flex-col gap-1">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href || pathname.startsWith(`${item.href}/`)

              const link = (
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'relative flex h-11 items-center rounded-field text-aux transition-colors',
                    collapsed ? 'justify-center px-0' : 'gap-3 px-3',
                    isActive
                      ? 'bg-white/12 font-semibold text-white'
                      : 'text-white/72 hover:bg-white/7 hover:text-white',
                  )}
                >
                  {/* Barra lateral de 3px em #A9D7BD no item ativo */}
                  {isActive ? (
                    <span
                      aria-hidden
                      className="absolute top-1/2 left-0 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-accent"
                    />
                  ) : null}

                  <item.icon
                    aria-hidden
                    className="size-[18px] shrink-0"
                    strokeWidth={1.75}
                  />

                  {collapsed ? (
                    <span className="sr-only">{item.label}</span>
                  ) : (
                    <span className="truncate">{item.label}</span>
                  )}
                </Link>
              )

              return (
                <li key={item.href}>
                  {collapsed ? (
                    <TooltipPrimitive.Root>
                      <TooltipPrimitive.Trigger asChild>
                        {link}
                      </TooltipPrimitive.Trigger>
                      <TooltipPrimitive.Portal>
                        <TooltipPrimitive.Content
                          side="right"
                          sideOffset={8}
                          className="z-50 rounded-[8px] bg-foreground px-2.5 py-1.5 text-label font-medium text-white shadow-raised"
                        >
                          {item.label}
                        </TooltipPrimitive.Content>
                      </TooltipPrimitive.Portal>
                    </TooltipPrimitive.Root>
                  ) : (
                    link
                  )}
                </li>
              )
            })}
          </ul>
        </nav>

        <div
          className={cn(
            'shrink-0 border-t border-white/10 py-3',
            collapsed ? 'px-2' : 'px-3',
          )}
        >
          <div
            className={cn(
              'flex items-center',
              collapsed ? 'justify-center' : 'gap-3 px-2 py-2',
            )}
          >
            <Avatar name={userName} size="sm" tone="light" />
            {!collapsed ? (
              <div className="min-w-0 flex-1">
                <p className="truncate text-label font-semibold text-white">
                  {userName}
                </p>
                <p className="truncate text-label text-white/72">{userRole}</p>
              </div>
            ) : null}
          </div>

          <Link
            href="/login"
            onClick={onNavigate}
            className={cn(
              'mt-1 flex h-11 items-center rounded-field text-aux text-white/72 transition-colors hover:bg-white/7 hover:text-white',
              collapsed ? 'justify-center' : 'gap-3 px-3',
            )}
          >
            <LogOut aria-hidden className="size-[18px]" strokeWidth={1.75} />
            {collapsed ? <span className="sr-only">Sair</span> : <span>Sair</span>}
          </Link>
        </div>
      </div>
    </TooltipPrimitive.Provider>
  )
}
