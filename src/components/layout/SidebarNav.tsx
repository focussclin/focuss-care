'use client'

import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { LogOut, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import type { MembershipRole } from '@/lib/supabase/database.types'

import { Avatar } from '@/components/ui/avatar'
import { cn } from '@/lib/utils/cn'
import { signOutAction } from '@/modules/identity/actions/signOut.action'

import { BrandMark } from './BrandMark'
import { navSections, visibleNavItems, type NavItem } from './navigation'

export interface SidebarNavProps {
  userName: string
  userRole: string
  /**
   * Papel na clínica ativa, para esconder o que ele não alcança.
   *
   * `undefined` mostra tudo — é o modo de demonstração, onde não há vínculo.
   */
  role?: MembershipRole | null
  variant: 'full' | 'rail' | 'drawer'
  onNavigate?: () => void
  onToggleCollapse?: () => void
}

export function SidebarNav({
  userName,
  userRole,
  role,
  variant,
  onNavigate,
  onToggleCollapse,
}: SidebarNavProps) {
  const pathname = usePathname()
  const items = visibleNavItems(role)
  const collapsed = variant === 'rail'

  function renderItem(item: NavItem) {
    const isActive =
      !item.disabled &&
      (pathname === item.href || pathname.startsWith(`${item.href}/`))

    const content = (
      <>
        {isActive ? (
          <span
            aria-hidden
            className="absolute inset-y-2 left-0 w-0.5 rounded-r-full bg-brand-accent"
          />
        ) : null}
        <item.icon aria-hidden className="size-[18px] shrink-0" strokeWidth={1.8} />
        <span className={cn('truncate', collapsed && 'sr-only')}>{item.label}</span>
        {item.disabled && !collapsed ? (
          <span
            aria-hidden
            className="ml-auto size-1.5 shrink-0 rounded-full bg-white/35"
          />
        ) : null}
      </>
    )

    const className = cn(
      'relative flex min-h-10 w-full items-center rounded-[10px] text-left text-aux transition-[background-color,color,transform] duration-150',
      collapsed ? 'justify-center px-0' : 'gap-3 px-3',
      item.disabled
        ? 'cursor-not-allowed text-white/38'
        : isActive
          ? 'bg-white/12 font-semibold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]'
          : 'text-white/70 hover:bg-white/8 hover:text-white active:scale-[0.99]',
    )

    if (item.disabled) {
      return (
        <span
          key={item.href}
          aria-disabled="true"
          title={`${item.label} — em breve`}
          className={className}
        >
          {content}
        </span>
      )
    }

    return (
      <Link
        key={item.href}
        href={item.href}
        onClick={onNavigate}
        aria-current={isActive ? 'page' : undefined}
        className={className}
      >
        {content}
      </Link>
    )
  }

  return (
    <TooltipPrimitive.Provider delayDuration={180}>
      <div className="flex h-full min-h-0 flex-col bg-brand text-white">
        <div
          className={cn(
            'flex h-[72px] shrink-0 items-center border-b border-white/10',
            collapsed ? 'justify-center px-2' : 'justify-between px-4',
          )}
        >
          {collapsed ? (
            <span
              aria-hidden
              className="flex size-9 items-center justify-center rounded-xl bg-white/10 text-sm font-bold text-brand-accent"
            >
              F
            </span>
          ) : (
            <BrandMark tone="light" />
          )}

          {variant !== 'drawer' ? (
            <button
              type="button"
              onClick={onToggleCollapse}
              aria-label={collapsed ? 'Expandir menu' : 'Recolher menu'}
              title={collapsed ? 'Expandir menu' : 'Recolher menu'}
              className="inline-flex size-9 items-center justify-center rounded-[9px] text-white/60 transition-colors hover:bg-white/10 hover:text-white"
            >
              {collapsed ? (
                <PanelLeftOpen aria-hidden className="size-[18px]" />
              ) : (
                <PanelLeftClose aria-hidden className="size-[18px]" />
              )}
            </button>
          ) : null}
        </div>

        <nav
          aria-label="Navegação principal"
          className={cn(
            'min-h-0 flex-1 overflow-y-auto py-4',
            collapsed ? 'px-2' : 'px-3',
          )}
        >
          {navSections.map((section, index) => (
            <div key={section.key} className={cn(index > 0 && 'mt-6')}>
              {!collapsed ? (
                <p className="mb-2 px-3 text-[10px] font-semibold tracking-[0.12em] text-white/38 uppercase">
                  {section.label}
                </p>
              ) : null}
              <ul className="flex flex-col gap-1">
                {items
                  .filter((item) => item.section === section.key)
                  .map((item) => (
                    <li key={item.href}>
                      {collapsed ? (
                        <TooltipPrimitive.Root>
                          <TooltipPrimitive.Trigger asChild>
                            {renderItem(item)}
                          </TooltipPrimitive.Trigger>
                          <TooltipPrimitive.Portal>
                            <TooltipPrimitive.Content
                              side="right"
                              sideOffset={10}
                              className="z-50 rounded-lg bg-foreground px-2.5 py-1.5 text-label font-medium text-white shadow-raised"
                            >
                              {item.disabled ? `${item.label} — em breve` : item.label}
                            </TooltipPrimitive.Content>
                          </TooltipPrimitive.Portal>
                        </TooltipPrimitive.Root>
                      ) : (
                        renderItem(item)
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className={cn('shrink-0 border-t border-white/10 p-3', collapsed && 'px-2')}>
          <div className={cn('flex items-center', collapsed ? 'justify-center' : 'gap-3 px-2 py-2')}>
            <Avatar name={userName} size="sm" tone="light" />
            {!collapsed ? (
              <div className="min-w-0 flex-1">
                <p className="truncate text-label font-semibold text-white">{userName}</p>
                <p className="truncate text-label text-white/58">{userRole}</p>
              </div>
            ) : null}
          </div>

          <form action={signOutAction}>
            <button
              type="submit"
              onClick={onNavigate}
              className={cn(
                'mt-1 flex min-h-10 w-full items-center rounded-[10px] text-aux text-white/65 transition-colors hover:bg-white/8 hover:text-white',
                collapsed ? 'justify-center px-0' : 'gap-3 px-3',
              )}
            >
              <LogOut aria-hidden className="size-[18px]" strokeWidth={1.8} />
              <span className={cn(collapsed && 'sr-only')}>Sair</span>
            </button>
          </form>
        </div>
      </div>
    </TooltipPrimitive.Provider>
  )
}
