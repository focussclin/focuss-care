import { CalendarPlus, UserPlus, UsersRound } from 'lucide-react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import type { Route } from 'next'

import { Card } from '@/components/ui/card'

interface QuickAction {
  title: string
  description: string
  href: Route
  icon: LucideIcon
}

/** As tres acoes definidas em DASHBOARD_DESIGN.md, secao "Acoes rapidas". */
const actions: readonly QuickAction[] = [
  {
    title: 'Cadastrar paciente',
    description: 'Adicione alguém à sua base em poucos campos.',
    href: '/pacientes?novo=1',
    icon: UserPlus,
  },
  {
    title: 'Agendar atendimento',
    description: 'Encontre um horário livre e confirme.',
    href: '/agenda?novo=1',
    icon: CalendarPlus,
  },
  {
    title: 'Convidar profissional',
    description: 'Traga mais alguém da equipe para o sistema.',
    href: '/equipe',
    icon: UsersRound,
  },
] as const

/**
 * Faixa de atalhos. Cada item parece um atalho, nao um card de metrica —
 * por isso icone + titulo + descricao de uma linha, sem numero em destaque.
 */
export function QuickActionsCard() {
  return (
    <Card className="p-2">
      <ul className="grid gap-1 sm:grid-cols-3">
        {actions.map((action) => (
          <li key={action.title}>
            <Link
              href={action.href}
              className="flex h-full items-start gap-3 rounded-[12px] p-3 transition-colors hover:bg-row-hover"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-subtle">
                <action.icon
                  aria-hidden
                  className="size-[18px] text-link"
                  strokeWidth={1.75}
                />
              </span>

              <span className="min-w-0">
                <span className="block text-aux font-semibold text-foreground">
                  {action.title}
                </span>
                <span className="mt-0.5 block text-label text-muted">
                  {action.description}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}
