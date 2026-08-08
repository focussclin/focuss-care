import {
  Archive,
  BarChart3,
  BellRing,
  Building2,
  CalendarDays,
  CheckSquare2,
  ClipboardList,
  ContactRound,
  CreditCard,
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
  PanelTop,
  ReceiptText,
  ScanLine,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Stethoscope,
  Tags,
  UserRoundCog,
  UserSearch,
  Users,
  Video,
  WalletCards,
  Workflow,
  type LucideIcon,
} from 'lucide-react'

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
  /** Rotas ainda não liberadas ficam visíveis, mas nunca parecem clicáveis. */
  disabled?: boolean
}

export const navItems: readonly NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutGrid, section: 'workspace' },
  { label: 'Indicadores e BI', href: '/indicadores', icon: Gauge, section: 'workspace', disabled: true },

  { label: 'Agenda', href: '/agenda', icon: CalendarDays, section: 'care' },
  { label: 'Pacientes 360', href: '/pacientes', icon: Users, section: 'care' },
  { label: 'Atendimentos', href: '/atendimentos', icon: Stethoscope, section: 'care' },
  { label: 'Prontuários', href: '/prontuarios', icon: ClipboardList, section: 'care' },
  { label: 'Recepção', href: '/recepcao', icon: ContactRound, section: 'care', disabled: true },
  { label: 'Fila e senhas', href: '/fila', icon: PanelTop, section: 'care', disabled: true },
  { label: 'Check-in digital', href: '/check-in', icon: ScanLine, section: 'care', disabled: true },
  { label: 'Display para TV', href: '/display', icon: MonitorPlay, section: 'care', disabled: true },
  { label: 'Salas e recursos', href: '/salas-e-recursos', icon: Building2, section: 'care', disabled: true },
  { label: 'Teleatendimento', href: '/teleatendimento', icon: Video, section: 'care', disabled: true },

  { label: 'CRM e Leads', href: '/crm', icon: UserSearch, section: 'relationship', disabled: true },
  { label: 'Inbox de atendimento', href: '/inbox', icon: Inbox, section: 'relationship', disabled: true },
  { label: 'WhatsApp', href: '/whatsapp', icon: MessageCircle, section: 'relationship' },
  { label: 'Portal do paciente', href: '/portal-paciente', icon: ContactRound, section: 'relationship', disabled: true },
  { label: 'Portal do profissional', href: '/portal-profissional', icon: UserRoundCog, section: 'relationship', disabled: true },

  { label: 'Chat IA', href: '/chat-ia', icon: Sparkles, section: 'intelligence' },
  { label: 'Automações', href: '/automacoes', icon: Workflow, section: 'intelligence' },
  { label: 'Insights proativos', href: '/insights', icon: BarChart3, section: 'intelligence', disabled: true },
  { label: 'Tarefas inteligentes', href: '/tarefas', icon: CheckSquare2, section: 'intelligence', disabled: true },

  { label: 'Financeiro', href: '/financeiro', icon: WalletCards, section: 'finance' },
  { label: 'Pagamentos', href: '/pagamentos', icon: CreditCard, section: 'finance', disabled: true },
  { label: 'Caixa', href: '/caixa', icon: ReceiptText, section: 'finance', disabled: true },
  { label: 'Conciliação bancária', href: '/conciliacao', icon: Landmark, section: 'finance', disabled: true },
  { label: 'Convênios', href: '/convenios', icon: ShieldCheck, section: 'finance' },
  { label: 'Estoque', href: '/estoque', icon: Package, section: 'finance', disabled: true },
  { label: 'Compras', href: '/compras', icon: ShoppingCart, section: 'finance', disabled: true },

  { label: 'Equipe e permissões', href: '/equipe', icon: UserRoundCog, section: 'management' },
  { label: 'Relatórios', href: '/relatorios', icon: FileBarChart, section: 'management' },
  { label: 'Documentos', href: '/documentos', icon: FilePenLine, section: 'management', disabled: true },
  { label: 'Formulários digitais', href: '/formularios', icon: FormInput, section: 'management', disabled: true },
  { label: 'Assinaturas', href: '/assinaturas', icon: FileSignature, section: 'management', disabled: true },
  { label: 'Auditoria', href: '/auditoria', icon: Archive, section: 'management', disabled: true },
  { label: 'Convites e tags', href: '/configuracoes?tab=workspace', icon: Tags, section: 'management', disabled: true },

  { label: 'Configurações', href: '/configuracoes', icon: Settings, section: 'settings' },
  { label: 'Integrações', href: '/configuracoes?tab=integracoes', icon: Workflow, section: 'settings', disabled: true },
  { label: 'Google e Outlook Calendar', href: '/configuracoes?tab=calendarios', icon: CalendarDays, section: 'settings', disabled: true },
  { label: 'Notificações', href: '/configuracoes?tab=notificacoes', icon: BellRing, section: 'settings', disabled: true },
] as const
