import type {
  PortalAppointmentDto,
  PortalSummaryDto,
  PortalTaskDto,
} from '../schemas/portal.schema'

export interface PortalProfissionalScreenProps {
  /** Primeiro nome de quem está olhando, para o cabeçalho. */
  greetingName: string
  /** "domingo, 10 de agosto" — formatado no servidor. */
  dayLabel: string
  summary: PortalSummaryDto
  /** O que está acontecendo agora, ou null. */
  current: PortalAppointmentDto | null
  /** Começaram e continuam abertos — pedem encerramento. */
  unclosed: readonly PortalAppointmentDto[]
  upcoming: readonly PortalAppointmentDto[]
  finished: readonly PortalAppointmentDto[]
  tasks: readonly PortalTaskDto[]
  /**
   * A sessão não tem linha em `professionals` nesta clínica.
   *
   * Não é erro nem lista vazia: é a pessoa certa na tela errada. Quando
   * verdadeiro, a tela **não** mostra agenda — mostra a explicação.
   */
  noProfessional: boolean
  /** `clinic_tasks` não existe no banco. Afeta só o painel de tarefas. */
  tasksSchemaPending: boolean
  /** Falso no modo demonstração, onde não há banco por trás. */
  isLive: boolean
}
