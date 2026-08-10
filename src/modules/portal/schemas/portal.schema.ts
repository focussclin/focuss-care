import type { StatusTone } from '@/components/ui/status-badge'

/**
 * Contrato serializável do portal do profissional.
 *
 * Não há schema Zod aqui, e a ausência é deliberada: o portal **não escreve
 * nada**. Zod existe no produto para validar entrada de cliente antes de uma
 * mutação, e a única entrada desta tela é a sessão — que o servidor resolve
 * sozinho, e que nunca chega pelo formulário.
 *
 * O que existe é o formato de saída. Ele carrega rótulos já prontos porque a
 * formatação de data em pt-BR feita no servidor é a mesma para todo mundo; feita
 * no navegador, depende do fuso da máquina — e num painel de clínica isso
 * significa dois profissionais lendo horários diferentes para a mesma consulta.
 */

export interface PortalAppointmentDto {
  id: string
  patientId: string
  patientName: string
  type: string
  /** "14:30" — já no fuso do servidor. */
  timeLabel: string
  /** "14:30 – 15:00", para as linhas que mostram a janela inteira. */
  windowLabel: string
  durationMinutes: number
  statusLabel: string
  statusTone: StatusTone
  /** ISO. A tela não o formata; existe para ordenação e para `<time dateTime>`. */
  startsAt: string
}

export interface PortalTaskDto {
  id: string
  title: string
  /** "vence hoje", "venceu há 2 dias", ou null quando não há prazo. */
  dueLabel: string | null
  isOverdue: boolean
  priority: number
  patientName: string | null
}

export interface PortalSummaryDto {
  remaining: number
  finished: number
  openTasks: number
  overdueTasks: number
}

/**
 * Por que a tela pode não ter o que mostrar.
 *
 * Três motivos MUITO diferentes, e tratá-los como um só é o que faz uma tela
 * mentir. `no-professional` não é erro nem vazio: é a pessoa certa na tela
 * errada, e a resposta é explicar, não mostrar zero.
 */
export type PortalUnavailableReason =
  /** A sessão não tem linha em `professionals` nesta clínica. */
  | 'no-professional'
  /** `clinic_tasks` ainda não existe no banco. Só afeta o painel de tarefas. */
  | 'tasks-schema-pending'

export const portalMessages = {
  noProfessional:
    'Sua conta não tem cadastro de profissional nesta clínica, então não há agenda pessoal para mostrar. Quem atende precisa de um registro em Equipe — peça a quem administra a clínica.',
  tasksPending:
    'As tarefas ainda não estão disponíveis: a tabela `clinic_tasks` não foi criada no banco. A agenda abaixo é real e não depende disso.',
  demo: 'Modo demonstração: sem banco por trás, esta tela não tem agenda real para mostrar. Nada aqui é exemplo.',
} as const
