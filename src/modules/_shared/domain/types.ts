import type { StatusTone } from '@/components/ui/status-badge'

/**
 * Tipos de leitura compartilhados entre dashboard, agenda e pacientes.
 * As tres telas mostram as mesmas entidades sob recortes diferentes — manter isso
 * em um lugar so evita que cada tela invente o proprio formato.
 */

/** Espelha o enum `appointment_status` do banco remoto. */
export type AppointmentStatus =
  | 'scheduled'
  | 'confirmed'
  | 'checked_in'
  | 'in_progress'
  | 'completed'
  | 'canceled'
  | 'no_show'

/**
 * O banco guarda apenas `patients.is_active`. 'follow-up' e um estado previsto
 * pelo handoff que ainda nao tem coluna correspondente — hoje so aparece nos dados
 * de demonstracao.
 */
export type PatientStatus = 'active' | 'inactive' | 'follow-up'

export interface Professional {
  id: string
  name: string
  specialty: string
}

export interface Patient {
  id: string
  name: string
  email: string
  phone: string
  /** Null quando a data de nascimento nao foi informada no cadastro. */
  birthDate: Date | null
  /** CPF, quando informado. */
  document?: string
  /** Opcional: o schema remoto ainda nao tem coluna de preferencia de contato. */
  contactPreference?: 'WhatsApp' | 'Telefone' | 'E-mail'
  /**
   * `patients.admin_notes` — observacao ADMINISTRATIVA do cadastro.
   *
   * Nao e prontuario nem nota clinica: essas moram em `records`, com versionamento
   * e auditoria de leitura proprios (F5 do roadmap). Existe aqui porque o
   * formulario de edicao precisa carregar o valor atual — sem ele, salvar o
   * formulario apagaria a observacao ja gravada.
   */
  adminNotes?: string | null
  status: PatientStatus
  createdAt: Date
  lastVisitAt: Date | null
  nextVisitAt: Date | null
}

export interface Appointment {
  id: string
  patientId: string
  patientName: string
  professionalId: string
  professionalName: string
  type: string
  startsAt: Date
  /** Duracao em minutos. */
  durationMinutes: number
  status: AppointmentStatus
  notes?: string
}

export interface ActivityEntry {
  id: string
  actorName: string
  /** Texto que segue o nome: "teve o cadastro atualizado." */
  description: string
  occurredAt: Date
}

export interface PatientNote {
  id: string
  authorName: string
  content: string
  createdAt: Date
}

/** Rotulo e tom visual de cada status, em um unico lugar. */
export const appointmentStatusMeta: Record<
  AppointmentStatus,
  { label: string; tone: StatusTone }
> = {
  scheduled: { label: 'Agendado', tone: 'pending' },
  confirmed: { label: 'Confirmado', tone: 'positive' },
  checked_in: { label: 'Aguardando', tone: 'pending' },
  in_progress: { label: 'Em atendimento', tone: 'positive' },
  completed: { label: 'Concluído', tone: 'neutral' },
  canceled: { label: 'Cancelado', tone: 'negative' },
  no_show: { label: 'Faltou', tone: 'negative' },
}

export const patientStatusMeta: Record<
  PatientStatus,
  { label: string; tone: StatusTone }
> = {
  active: { label: 'Ativo', tone: 'positive' },
  inactive: { label: 'Inativo', tone: 'neutral' },
  'follow-up': { label: 'Acompanhamento', tone: 'pending' },
}
