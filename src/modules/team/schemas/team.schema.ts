import { z } from 'zod'

import type { MembershipRole } from '@/lib/supabase/database.types'

export const teamMessages = {
  invalidFields: 'Revise os campos destacados e tente novamente.',
  /**
   * Recusa de auto-revogação.
   *
   * Não é "erro": é o sistema impedindo que alguém se tranque para fora. A
   * mensagem diz o caminho — outra pessoa faz — em vez de só negar.
   */
  selfRevoke:
    'Você não pode revogar o seu próprio acesso. Peça a outro responsável da clínica.',
  /**
   * Recusa de deixar a clínica sem dono.
   *
   * Uma clínica sem `owner` ativo não tem quem gerencie a equipe nem quem
   * responda pela assinatura, e o caminho de volta exige mexer direto no banco.
   */
  lastOwner:
    'Esta clínica precisa de pelo menos um responsável. Defina outro responsável antes de alterar este acesso.',
  forbidden: 'Você não tem permissão para gerenciar a equipe.',
  notFound: 'Este vínculo não está mais disponível nesta clínica.',
  unavailable: 'Não foi possível falar com o servidor agora. Tente novamente.',
  unexpected: 'Não foi possível concluir a ação agora. Tente novamente.',
  /**
   * Emissão de convite indisponível.
   *
   * Texto exibido no lugar do botão. Diz o que está faltando e que não é falha
   * de quem está usando — um "em breve" genérico faria a pessoa tentar de novo.
   */
  inviteUnavailable:
    'A emissão de convites ainda não está disponível: depende de uma alteração no banco de dados que precisa ser aplicada pela equipe técnica. Convites já existentes continuam funcionando normalmente.',
} as const

/** Papéis que a tela oferece, com o que cada um significa na prática. */
export const roleOptions = [
  {
    value: 'owner',
    label: 'Responsável',
    hint: 'Acesso total, incluindo equipe, financeiro e prontuário.',
  },
  {
    value: 'admin',
    label: 'Administrador',
    hint: 'Gerencia a clínica e a equipe. Não acessa prontuário.',
  },
  {
    value: 'professional',
    label: 'Profissional',
    hint: 'Atende e registra no prontuário dos seus pacientes.',
  },
  {
    value: 'receptionist',
    label: 'Recepção',
    hint: 'Agenda, fila e cadastro de pacientes. Não acessa prontuário.',
  },
  {
    value: 'finance',
    label: 'Financeiro',
    hint: 'Faturamento e cobranças. Não acessa prontuário.',
  },
] as const satisfies readonly {
  value: MembershipRole
  label: string
  hint: string
}[]

const roleValues = [
  'owner',
  'admin',
  'professional',
  'receptionist',
  'finance',
] as const satisfies readonly MembershipRole[]

export const changeRoleSchema = z.object({
  membershipId: z.uuid(teamMessages.unexpected),
  role: z.enum(roleValues),
})

export type ChangeRoleInput = z.infer<typeof changeRoleSchema>

export const revokeMembershipSchema = z.object({
  membershipId: z.uuid(teamMessages.unexpected),
})

export type RevokeMembershipInput = z.infer<typeof revokeMembershipSchema>

/**
 * O que as Server Actions devolvem ao cliente.
 *
 * `email` viaja porque a tela precisa distinguir dois membros com nome
 * parecido — em clínica pequena, "Ana R." e "Ana Ribeiro" são pessoas
 * diferentes e confundi-las ao revogar acesso é caro.
 */
export interface TeamMemberDto {
  id: string
  userId: string
  name: string
  email: string
  role: string
  status: string
  specialties: readonly string[]
  /** ISO 8601, ou null quando o convite ainda não foi aceito. */
  acceptedAt: string | null
}

export interface PendingInvitationDto {
  id: string
  email: string
  role: string
  expiresAt: string
}
