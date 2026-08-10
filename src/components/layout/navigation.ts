import {
  Archive,
  BarChart3,
  Building2,
  CalendarDays,
  CheckSquare2,
  ClipboardList,
  ContactRound,
  FileBarChart,
  FilePenLine,
  FileSignature,
  FormInput,
  Gauge,
  Inbox,
  Landmark,
  LayoutGrid,
  MessageCircle,
  MonitorPlay,
  Package,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Stethoscope,
  UserRoundCog,
  UserSearch,
  Users,
  WalletCards,
  Workflow,
  type LucideIcon,
} from 'lucide-react'

import { can, type Permission } from '@/lib/auth/permissions'
import type { MembershipRole } from '@/lib/supabase/database.types'

export const navSections = [
  { key: 'workspace', label: 'Visão geral' },
  { key: 'care', label: 'Operação clínica' },
  { key: 'relationship', label: 'Relacionamento' },
  { key: 'intelligence', label: 'Inteligência' },
  { key: 'finance', label: 'Financeiro' },
  { key: 'management', label: 'Gestão' },
  { key: 'settings', label: 'Configurações' },
] as const

export type NavSection = (typeof navSections)[number]['key']

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  section: NavSection
  /**
   * Rotas que não existem ficam visíveis, mas nunca parecem clicáveis.
   *
   * O texto delas diz "não faz parte desta versão", e não "em breve". Nenhum
   * destes itens — hoje só `/portal-paciente` — aparece em fatia nenhuma do
   * roadmap: "em breve" afirmava um cronograma que não existe, e é o mesmo
   * defeito que fez `/pagamentos` e `/caixa` prometerem recursos que já
   * estavam entregues.
   *
   * `/portal-profissional` SAIU desta lista em 10/08/2026: a tela existe, lê
   * `appointments` — tabela que o banco tem — e filtra pelo
   * `current_professional_id()` da sessão. O painel de tarefas depende de
   * `clinic_tasks` e declara a própria pendência sem derrubar o resto, então
   * o item não é `availability: 'setup'`: a função principal funciona.
   */
  disabled?: boolean
  /** A tela pode ser revisada, mas ainda depende de migration ou setup externo. */
  availability?: 'setup'
  /**
   * Permissão exigida pela ROTA para renderizar.
   *
   * Quando presente, o item some do menu de quem não a tem. Não é a fronteira de
   * segurança — a rota chama `forbidden()` de qualquer forma —, é o princípio de
   * I-05: **não oferecer o que não funciona**. Um `finance` que clica em
   * "Agenda" e recebe 403 aprendeu, na pior hora, algo que o menu podia ter dito
   * antes.
   */
  permission?: Permission
}

export const navItems: readonly NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutGrid, section: 'workspace' },
  { label: 'Indicadores e BI', href: '/indicadores', icon: Gauge, section: 'workspace', permission: 'report.read' },

  { label: 'Agenda', href: '/agenda', icon: CalendarDays, section: 'care', permission: 'appointment.read' },
  { label: 'Pacientes 360', href: '/pacientes', icon: Users, section: 'care', permission: 'patient.read' },
  { label: 'Atendimentos', href: '/atendimentos', icon: Stethoscope, section: 'care', permission: 'encounter.read' },
  { label: 'Prontuários', href: '/prontuarios', icon: ClipboardList, section: 'care', permission: 'record.read' },
  { label: 'Recepção', href: '/recepcao', icon: ContactRound, section: 'care', permission: 'encounter.read' },
  { label: 'Display para TV', href: '/display', icon: MonitorPlay, section: 'care', permission: 'encounter.read' },

  /*
   * Dois itens foram REMOVIDOS aqui: "Fila e senhas" e "Check-in digital".
   *
   * Os dois descreviam o que `/atendimentos` já faz — a fila com prioridade,
   * chamada e check-in — e ficariam apagados para sempre, porque não há o que
   * construir além do que existe. "Senhas" exigiria número de senha, coluna que
   * `waiting_queue` não tem; "check-in digital" é o paciente dando entrada
   * sozinho, o que é o Portal do paciente, não esta tela.
   *
   * Item permanentemente desabilitado é a mesma promessa vazia que fez os quatro
   * `?tab=` saírem: duas declarações da mesma ausência, uma delas errada, é pior
   * que uma só. A fila está em `/atendimentos`, e o painel dela em `/display`.
   */

  { label: 'Salas e recursos', href: '/salas-e-recursos', icon: Building2, section: 'care', permission: 'clinic.settings', availability: 'setup' },

  { label: 'CRM e Leads', href: '/crm', icon: UserSearch, section: 'relationship', permission: 'team.read', availability: 'setup' },
  { label: 'Inbox de atendimento', href: '/inbox', icon: Inbox, section: 'relationship', permission: 'encounter.read', availability: 'setup' },
  { label: 'WhatsApp', href: '/whatsapp', icon: MessageCircle, section: 'relationship' },
  { label: 'Portal do paciente', href: '/portal-paciente', icon: ContactRound, section: 'relationship', disabled: true },
  { label: 'Portal do profissional', href: '/portal-profissional', icon: UserRoundCog, section: 'relationship', permission: 'appointment.read' },

  { label: 'Chat IA', href: '/chat-ia', icon: Sparkles, section: 'intelligence' },
  { label: 'Automações', href: '/automacoes', icon: Workflow, section: 'intelligence' },
  { label: 'Insights proativos', href: '/insights', icon: BarChart3, section: 'intelligence', permission: 'report.read' },
  { label: 'Tarefas', href: '/tarefas', icon: CheckSquare2, section: 'intelligence', permission: 'team.read', availability: 'setup' },

  /*
   * "Pagamentos" e "Caixa" foram REMOVIDOS daqui, e não adiados.
   *
   * B-01 entregou os dois dentro de `/financeiro`. Mantê-los como itens
   * separados marcados "em breve" diria que a clínica ainda não pode receber
   * nem fechar o caixa — sobre um recurso que está funcionando uma tela ao lado.
   */
  { label: 'Financeiro', href: '/financeiro', icon: WalletCards, section: 'finance', permission: 'invoice.read' },
  { label: 'Conciliação bancária', href: '/conciliacao', icon: Landmark, section: 'finance', permission: 'invoice.read', availability: 'setup' },
  { label: 'Convênios', href: '/convenios', icon: ShieldCheck, section: 'finance', permission: 'insurance.manage' },
  { label: 'Estoque', href: '/estoque', icon: Package, section: 'finance', permission: 'invoice.read', availability: 'setup' },
  { label: 'Compras', href: '/compras', icon: ShoppingCart, section: 'finance', permission: 'invoice.read', availability: 'setup' },

  { label: 'Equipe e permissões', href: '/equipe', icon: UserRoundCog, section: 'management', permission: 'team.read' },
  { label: 'Relatórios', href: '/relatorios', icon: FileBarChart, section: 'management', permission: 'report.read' },
  { label: 'Documentos', href: '/documentos', icon: FilePenLine, section: 'management', permission: 'patient.read' },
  { label: 'Formulários digitais', href: '/formularios', icon: FormInput, section: 'management', permission: 'clinic.settings', availability: 'setup' },
  { label: 'Assinaturas', href: '/assinaturas', icon: FileSignature, section: 'management', permission: 'clinic.settings' },
  { label: 'Auditoria', href: '/auditoria', icon: Archive, section: 'management', permission: 'audit.read' },

  /*
   * Quatro itens `?tab=…` foram REMOVIDOS: "Convites e tags", "Integrações",
   * "Google e Outlook Calendar" e "Notificações".
   *
   * Todos apontavam para `/configuracoes` com um parâmetro que a rota **não
   * lê**. Mesmo desabilitados, eram quatro endereços que não existem — e a
   * própria tela de configurações já declara, em texto, o que ela não configura
   * e por quê. Duas declarações da mesma ausência, uma delas errada, é pior que
   * uma só.
   */
  { label: 'Configurações', href: '/configuracoes', icon: Settings, section: 'settings' },
] as const

/**
 * O menu que ESTE papel enxerga.
 *
 * `role` ausente devolve tudo, e isso é deliberado: acontece no modo de
 * demonstração, onde não há vínculo nem papel para consultar, e a demonstração
 * existe justamente para mostrar a interface inteira.
 *
 * Filtrar aqui não substitui a autorização da rota — `/prontuarios`,
 * `/financeiro` e `/convenios` continuam chamando `forbidden()`. As duas
 * existem porque protegem coisas diferentes: a rota impede o acesso, o menu
 * evita oferecer o caminho.
 */
export function visibleNavItems(
  role: MembershipRole | null | undefined,
): readonly NavItem[] {
  if (role === undefined) return navItems

  return navItems.filter(
    (item) => !item.permission || can(role, item.permission),
  )
}
