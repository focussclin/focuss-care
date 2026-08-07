import {
  CalendarDays,
  FileBarChart,
  LayoutGrid,
  Settings,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
}

/**
 * Ordem definida em DASHBOARD_DESIGN.md, secao "Navegacao lateral".
 * Rotas ainda nao implementadas apontam para o proprio dashboard para nao gerar
 * 404 — serao redirecionadas quando cada tela chegar.
 */
export const navItems: readonly NavItem[] = [
  { label: 'Visão geral', href: '/dashboard', icon: LayoutGrid },
  { label: 'Agenda', href: '/agenda', icon: CalendarDays },
  { label: 'Pacientes', href: '/pacientes', icon: Users },
  { label: 'Equipe', href: '/equipe', icon: UsersRound },
  { label: 'Relatórios', href: '/relatorios', icon: FileBarChart },
  { label: 'Configurações', href: '/configuracoes', icon: Settings },
] as const
