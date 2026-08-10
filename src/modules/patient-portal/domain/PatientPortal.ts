import type { AppointmentStatus } from '@/modules/_shared/domain/types'

/**
 * O que o portal do paciente conhece — e o que ele deliberadamente não conhece.
 *
 * # A fronteira
 *
 * Não há `MedicalRecord` neste arquivo, não há `admin_notes`, não há
 * `internal_notes`. A ausência é a feature: o portal lê por função com lista
 * fechada de colunas (ver `20260810_patient_portal.sql` §3), e este domínio é o
 * espelho dessa lista. Se um campo aparecer aqui sem existir lá, ele chega
 * `undefined` em produção; se aparecer lá sem existir aqui, ninguém o vê.
 *
 * As duas pontas mudam juntas, de propósito.
 */

export interface PortalProfile {
  patientId: string
  clinicId: string
  clinicName: string | null
  /** Nome social quando existe; é assim que a pessoa quer ser chamada. */
  displayName: string
  legalName: string
  birthDate: Date | null
  email: string | null
  phone: string | null
}

export interface PortalAppointment {
  id: string
  startsAt: Date
  endsAt: Date
  status: AppointmentStatus
  /** O motivo que a recepção registrou ao marcar. Não é nota clínica. */
  reason: string | null
  professionalName: string | null
}

export type PortalInvoiceStatus =
  | 'draft'
  | 'issued'
  | 'partially_paid'
  | 'paid'
  | 'overdue'

export interface PortalInvoice {
  id: string
  status: PortalInvoiceStatus
  issueDate: Date | null
  dueDate: Date | null
  totalCents: number
  paidCents: number
}

/** Quanto ainda falta pagar. Nunca negativo: pagamento a mais não vira crédito aqui. */
export function outstandingCents(invoice: PortalInvoice): number {
  return Math.max(invoice.totalCents - invoice.paidCents, 0)
}

/**
 * A cobrança está quitada?
 *
 * Pelo VALOR, e não só pelo status. `paid` e `partially_paid` são escritos pelo
 * financeiro e podem ficar para trás de um pagamento recém-registrado; o saldo
 * zerado é o fato. Dizer "em aberto" para quem já pagou é o erro que gera
 * ligação — e desconfiança.
 */
export function isSettled(invoice: PortalInvoice): boolean {
  return outstandingCents(invoice) === 0
}

export type PortalInviteStatus =
  | 'valid'
  | 'expired'
  | 'accepted'
  | 'revoked'
  | 'not-found'

/**
 * O que a tela do convite pode mostrar antes de existir sessão.
 *
 * `maskedEmail` nunca é o endereço inteiro. O token viaja por WhatsApp, e-mail e
 * papel; se ele revelasse o e-mail do paciente, interceptá-lo passaria a
 * entregar dado pessoal mesmo sem conseguir aceitar nada.
 */
export interface PortalInvitePreview {
  status: PortalInviteStatus
  clinicName: string | null
  patientFirstName: string | null
  maskedEmail: string | null
  expiresAt: Date | null
}

/** Convite recém-criado. O token existe uma vez, e só aqui. */
export interface CreatedPortalInvite {
  token: string
  expiresAt: Date
}

export interface PortalInviteSummary {
  id: string
  email: string
  status: 'pending' | 'accepted' | 'revoked'
  expiresAt: Date
  createdAt: Date
  acceptedAt: Date | null
}

/**
 * Separa as consultas em "próximas" e "anteriores".
 *
 * `now` é parâmetro pelo mesmo motivo de `portal/domain/ProfessionalDay`:
 * função que lê o relógio não tem borda testável.
 *
 * O corte é o INÍCIO da consulta, e não o fim: uma consulta que começou há dez
 * minutos já não é "próxima" para quem está na sala de espera olhando o
 * celular.
 */
export function splitAppointments(
  appointments: readonly PortalAppointment[],
  now: Date,
): { upcoming: PortalAppointment[]; past: PortalAppointment[] } {
  const instant = now.getTime()

  const upcoming = appointments
    .filter(
      (item) =>
        item.startsAt.getTime() >= instant &&
        item.status !== 'canceled' &&
        item.status !== 'no_show',
    )
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())

  /*
   * Cancelada e falta caem no histórico mesmo estando no futuro.
   *
   * Uma consulta cancelada para semana que vem não é compromisso — mostrá-la
   * como "próxima" faria a pessoa aparecer na clínica. E some-la de vez seria
   * pior: ela precisa saber que aquele horário não vale mais.
   */
  const past = appointments
    .filter((item) => !upcoming.includes(item))
    .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime())

  return { upcoming, past }
}
