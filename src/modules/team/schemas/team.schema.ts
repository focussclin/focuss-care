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
  roleEscalation:
    'Só quem é proprietário pode conceder o papel de proprietário.',
  notFound: 'Este vínculo não está mais disponível nesta clínica.',
  unavailable: 'Não foi possível falar com o servidor agora. Tente novamente.',
  unexpected: 'Não foi possível concluir a ação agora. Tente novamente.',
  /** Falha de configuração do endereço público usado no link do convite. */
  inviteUnavailable:
    'Não foi possível montar o link público do convite. Configure APP_URL no ambiente do servidor e tente novamente.',
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

export const createInvitationSchema = z.object({
  email: z
    .email(teamMessages.invalidFields)
    .trim()
    .toLowerCase()
    .max(254, teamMessages.invalidFields),
  role: z.enum(roleValues),
})

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>

export interface CreatedInvitationDto {
  email: string
  role: string
  expiresAt: string
  inviteUrl: string
}

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

// ---------------------------------------------------------------------------
// Vínculo trabalhista e ausências — feature S-02
// ---------------------------------------------------------------------------

export const employeeMessages = {
  nameRequired: 'Informe o nome do funcionário.',
  contractRequired: 'Escolha o tipo de contrato.',
  employeeRequired: 'Selecione o funcionário.',
  datesRequired: 'Informe as datas de início e fim.',
  datesInverted: 'A data de fim precisa ser igual ou depois da de início.',
  /**
   * Recusa de responder ausência já respondida.
   *
   * Reescrever apaga quem decidiu e quando — e é esse registro que a clínica
   * precisa ter se a ausência virar questionamento trabalhista.
   */
  alreadyAnswered:
    'Esta ausência já foi respondida. Registre uma nova solicitação em vez de sobrescrever a decisão anterior.',
  /** Texto exibido onde estaria a escala de trabalho. */
  schedulesUnavailable:
    'Escalas de trabalho ainda não são geridas aqui: a tabela guarda o dia da semana como número, e a convenção usada (domingo em zero ou em sete) não pôde ser verificada. Errar entre as duas desloca a semana em um dia e põe alguém para trabalhar na data errada.',
} as const

/** Tipos de contrato do enum `contract_type`, com o nome que a clínica usa. */
export const contractTypeOptions = [
  { value: 'clt', label: 'CLT' },
  { value: 'pj', label: 'Pessoa jurídica' },
  { value: 'autonomo', label: 'Autônomo' },
  { value: 'estagio', label: 'Estágio' },
  { value: 'temporario', label: 'Temporário' },
] as const

/** Tipos de ausência do enum `time_off_kind`. */
export const timeOffKindOptions = [
  { value: 'ferias', label: 'Férias' },
  { value: 'atestado', label: 'Atestado' },
  { value: 'folga', label: 'Folga' },
  { value: 'licenca', label: 'Licença' },
  { value: 'falta', label: 'Falta' },
  { value: 'banco_horas', label: 'Banco de horas' },
] as const

export const timeOffStatusLabels: Record<string, string> = {
  requested: 'Aguardando decisão',
  approved: 'Aprovada',
  denied: 'Negada',
  canceled: 'Cancelada',
}

export const createEmployeeSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, employeeMessages.nameRequired)
    .max(120, teamMessages.invalidFields),
  roleTitle: z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? '')
    .transform((value) => (value === '' ? null : value)),
  contractType: z.enum([
    'clt',
    'pj',
    'autonomo',
    'estagio',
    'temporario',
  ]),
  /** Liga o funcionário a um cadastro de profissional, quando ele atende. */
  professionalId: z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? '')
    .transform((value) => (value === '' ? null : value)),
})

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, employeeMessages.datesRequired)

export const createTimeOffSchema = z
  .object({
    employeeId: z.uuid(employeeMessages.employeeRequired),
    kind: z.enum([
      'ferias',
      'atestado',
      'folga',
      'licenca',
      'falta',
      'banco_horas',
    ]),
    startsOn: dateOnly,
    endsOn: dateOnly,
    reason: z
      .string()
      .optional()
      .transform((value) => value?.trim() ?? '')
      .transform((value) => (value === '' ? null : value)),
  })
  .superRefine((value, ctx) => {
    // Comparação de texto funciona em 'YYYY-MM-DD' e evita fuso no meio do
    // caminho — a data aqui é dia de calendário, não instante.
    if (value.endsOn < value.startsOn) {
      ctx.addIssue({
        code: 'custom',
        path: ['endsOn'],
        message: employeeMessages.datesInverted,
      })
    }
  })

export type CreateTimeOffInput = z.infer<typeof createTimeOffSchema>

export const answerTimeOffSchema = z.object({
  timeOffId: z.uuid(teamMessages.unexpected),
  approved: z.boolean(),
})

export type AnswerTimeOffInput = z.infer<typeof answerTimeOffSchema>

export interface EmployeeDto {
  id: string
  fullName: string
  roleTitle: string | null
  contractType: string
  isActive: boolean
}

export interface TimeOffDto {
  id: string
  employeeName: string
  kind: string
  status: string
  startsOn: string
  endsOn: string
  /**
   * O motivo NÃO viaja.
   *
   * `time_off.reason` é texto livre e, em atestado e licença, costuma dizer a
   * condição de saúde da pessoa. A tela de equipe é vista por quem administra,
   * não por quem cuida — o campo continua na tabela, onde a RLS o protege.
   */
  answeredAt: string | null
}
