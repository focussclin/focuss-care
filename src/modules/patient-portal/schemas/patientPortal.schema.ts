import { z } from 'zod'

import type { StatusTone } from '@/components/ui/status-badge'

export const patientPortalMessages = {
  invalidFields: 'Confira os campos destacados.',
  invalidEmail: 'Informe um e-mail válido para enviar o convite.',
  forbidden: 'Você não tem permissão para dar acesso ao portal.',
  notFound: 'Paciente não encontrado nesta clínica.',
  alreadyLinked: 'Este paciente já tem acesso ao portal.',
  unavailable: 'Não foi possível falar com o servidor. Tente de novo.',
  unexpected: 'Não foi possível concluir agora.',
  schemaPending:
    'O portal do paciente ainda não está disponível: a migration `20260810_patient_portal.sql` não foi aplicada no banco.',

  // --- Lado do paciente -------------------------------------------------------
  inviteNotFound:
    'Este link de acesso não existe. Confira se ele foi copiado inteiro, ou peça um novo à clínica.',
  inviteExpired:
    'Este link de acesso venceu. Peça um novo à clínica — eles levam alguns segundos para gerar.',
  inviteUsed:
    'Este convite já foi usado. Se o acesso é seu, entre pelo login com o mesmo e-mail.',
  inviteRevoked:
    'A clínica cancelou este convite. Fale com a recepção para receber um novo.',
  emailMismatch:
    'Este convite é para outro e-mail. Entre com o endereço que a clínica cadastrou — o que aparece mascarado acima.',
  /**
   * Mensagem do PACIENTE, separada da da equipe.
   *
   * `invalidEmail` diz "para enviar o convite", que descreve o trabalho de quem
   * emite. Quem lê esta tela está recebendo, e a frase da outra ponta o deixaria
   * procurando um botão de enviar que não existe.
   */
  invalidOwnEmail: 'Digite um e-mail válido para receber o link.',
  notAuthenticated: 'Sua sessão expirou. Peça o link de acesso de novo.',
  linkSent:
    'Se este endereço for o do convite, o link de acesso chega em instantes. Confira também o spam.',
  otpUnavailable:
    'Não foi possível pedir o link agora. Verifique a conexão e tente de novo.',
} as const

/**
 * Entrada da equipe ao gerar o convite.
 *
 * **Não há `clinicId` aqui** (P3): a clínica sai de `current_clinic_id()` dentro
 * da própria função do banco, e mandá-la do cliente daria ao chamador a chance
 * de escolher o tenant.
 *
 * O `email` é o do convite, e vai ser exigido no aceite. Ele nasce preenchido
 * com `patients.email` na tela, mas continua editável de propósito: o cadastro
 * pode ter o e-mail da mãe, e quem vai usar o portal é a filha.
 */
export const createPortalInviteSchema = z.object({
  patientId: z.uuid(patientPortalMessages.notFound),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .min(1, patientPortalMessages.invalidEmail)
    .max(320, patientPortalMessages.invalidEmail)
    .email(patientPortalMessages.invalidEmail),
  /**
   * Validade em dias. Curta por padrão.
   *
   * Sete dias é o mesmo prazo do convite de equipe. O teto de 30 existe porque
   * um convite de portal que vale um ano é uma credencial esquecida numa
   * conversa de WhatsApp.
   */
  expiresInDays: z.number().int().min(1).max(30).default(7),
})

export type CreatePortalInviteInput = z.infer<typeof createPortalInviteSchema>

export const revokePortalInviteSchema = z.object({
  inviteId: z.uuid(patientPortalMessages.notFound),
})

export type RevokePortalInviteInput = z.infer<typeof revokePortalInviteSchema>

/**
 * Token do convite, validado antes de ir ao banco.
 *
 * 64 hex é exatamente o que `encode(gen_random_bytes(32), 'hex')` produz.
 * Recusar aqui o que não tem essa forma evita uma ida ao banco por URL
 * digitada errado — e deixa explícito, no código da aplicação, qual é o
 * formato, em vez de essa informação viver só no SQL.
 */
export const portalTokenSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{64}$/i, patientPortalMessages.inviteNotFound)

// --- DTOs serializáveis -------------------------------------------------------

export interface PortalInviteCreatedDto {
  /** URL completa, pronta para copiar. O token aparece só aqui. */
  url: string
  /** "16/08/2026" */
  expiresLabel: string
}

export interface PortalInviteSummaryDto {
  id: string
  email: string
  status: 'pending' | 'accepted' | 'revoked'
  statusLabel: string
  statusTone: StatusTone
  /** "vence em 16/08/2026" ou "aceito em 12/08/2026" */
  detailLabel: string
}

export interface PortalAppointmentDto {
  id: string
  dayLabel: string
  timeLabel: string
  statusLabel: string
  statusTone: StatusTone
  professionalName: string | null
  reason: string | null
  startsAt: string
}

export interface PortalInvoiceDto {
  id: string
  statusLabel: string
  statusTone: StatusTone
  totalLabel: string
  outstandingLabel: string | null
  dueLabel: string | null
  isSettled: boolean
}

export interface PortalProfileDto {
  patientId: string
  clinicName: string | null
  displayName: string
  legalName: string
  birthLabel: string | null
  email: string | null
  phone: string | null
}
