import { z } from 'zod'

import { COUNCIL_TYPES, MAX_SLOT_MINUTES, MIN_SLOT_MINUTES } from '../domain/Professional'

export const professionalMessages = {
  invalidFields: 'Revise os campos destacados e tente novamente.',
  nameRequired: 'Informe o nome como ele deve aparecer na agenda.',
  nameTooLong: 'Use no máximo 120 caracteres.',
  councilIncomplete:
    'Conselho incompleto: informe sigla, número e estado juntos, ou deixe os três em branco.',
  councilNumberTooLong: 'Use no máximo 30 caracteres no número do conselho.',
  councilStateInvalid: 'Informe a sigla do estado com duas letras — SP, RJ, MG.',
  specialtyTooLong: 'Cada especialidade deve ter no máximo 60 caracteres.',
  specialtiesTooMany: 'Informe no máximo 10 especialidades.',
  slotInvalid: `A duração padrão deve ser um número inteiro entre ${MIN_SLOT_MINUTES} e ${MAX_SLOT_MINUTES} minutos.`,
  /**
   * Recusa de vincular alguém que não é da clínica.
   *
   * `professionals.user_id` referencia `profiles.id` — o banco aceitaria
   * qualquer usuário existente, de qualquer clínica. Ver `userBelongsToClinic`.
   */
  userNotInClinic:
    'Essa pessoa não tem acesso ativo a esta clínica. Convide-a pela Equipe antes de vincular.',
  userAlreadyLinked:
    'Essa pessoa já está vinculada a outro cadastro de profissional nesta clínica.',
  forbidden: 'Você não tem permissão para gerenciar os profissionais desta clínica.',
  notFound: 'Este profissional não está mais disponível nesta clínica.',
  writeForbidden:
    'O profissional foi carregado, mas o banco recusou a gravação. Falta policy de escrita em `professionals` para este papel.',
  unavailable: 'Não foi possível falar com o servidor agora. Tente novamente.',
  unexpected: 'Não foi possível concluir a ação agora. Tente novamente.',
  /**
   * Exibido junto de quem não tem usuário vinculado.
   *
   * Não é erro: é a consequência de um cadastro legítimo. Quem não tem conta
   * aparece na agenda e não assina, e é melhor saber disso aqui do que na hora
   * de fechar um prontuário.
   */
  signatureNeedsUser:
    'Sem usuário vinculado: aparece na agenda, mas não assina prontuário nem prescrição.',
  /**
   * `agenda_color` fica de fora, e a tela diz por quê.
   *
   * Nenhuma view lê a coluna: a agenda colore por STATUS do atendimento, e o
   * tipo que chega até ela (`_shared/domain/types.ts`) carrega só id, nome e
   * especialidade. Um seletor de cor aqui gravaria um valor que ninguém exibe —
   * um controle que não muda nada é pior que a ausência dele.
   */
  colorUnavailable:
    'A cor de agenda não é escolhida aqui: nenhuma tela lê `professionals.agenda_color` hoje — a agenda colore por status do atendimento.',
} as const

const optionalText = (max: number, message: string) =>
  z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? '')
    .refine((value) => value.length <= max, message)
    .transform((value) => (value === '' ? null : value))

/**
 * Especialidades chegam como texto separado por vírgula e saem como lista.
 *
 * A coluna é `text[]` NOT NULL — sem especialidade a lista é vazia, nunca nula.
 * Duplicatas somem: a mesma especialidade duas vezes não diz nada a mais e
 * apareceria repetida na ficha do membro, que já lê este campo.
 */
const specialties = z
  .string()
  .optional()
  .transform((value) =>
    (value ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry !== ''),
  )
  .transform((entries) => [...new Set(entries)])
  .refine(
    (entries) => entries.every((entry) => entry.length <= 60),
    professionalMessages.specialtyTooLong,
  )
  .refine((entries) => entries.length <= 10, professionalMessages.specialtiesTooMany)

/**
 * O vínculo com usuário: vazio, ou um uuid.
 *
 * O `select` da tela manda `''` quando ninguém está escolhido, e `''` não é
 * uuid — sem este ramo, "sem vínculo" viraria erro de validação em vez do caso
 * normal que é.
 */
const optionalUserId = z
  .union([z.literal(''), z.uuid(professionalMessages.userNotInClinic)])
  .optional()
  .transform((value) => value || null)

const professionalShape = {
  displayName: z
    .string()
    .trim()
    .min(2, professionalMessages.nameRequired)
    .max(120, professionalMessages.nameTooLong),
  councilType: z
    .union([z.literal(''), z.enum(COUNCIL_TYPES)])
    .optional()
    .transform((value) => value || null),
  councilNumber: optionalText(30, professionalMessages.councilNumberTooLong),
  councilState: z
    .string()
    .optional()
    .transform((value) => value?.trim().toUpperCase() ?? '')
    .refine(
      (value) => value === '' || /^[A-Z]{2}$/.test(value),
      professionalMessages.councilStateInvalid,
    )
    .transform((value) => (value === '' ? null : value)),
  specialties,
  defaultSlotMinutes: z.coerce
    .number()
    .int(professionalMessages.slotInvalid)
    .min(MIN_SLOT_MINUTES, professionalMessages.slotInvalid)
    .max(MAX_SLOT_MINUTES, professionalMessages.slotInvalid),
  userId: optionalUserId,
}

/**
 * Sigla, número e estado do conselho andam juntos.
 *
 * "CRM 12345" sem estado não identifica ninguém — o mesmo número existe em cada
 * unidade federativa. O erro aponta para `councilNumber` porque é o campo do
 * meio: quem preencheu só a sigla e quem preencheu só o número chegam ao mesmo
 * aviso, ao lado do campo que falta.
 */
const councilMustBeComplete = (
  value: {
    councilType: string | null
    councilNumber: string | null
    councilState: string | null
  },
  ctx: z.RefinementCtx,
) => {
  const filled = [value.councilType, value.councilNumber, value.councilState].filter(
    (entry) => entry !== null,
  ).length

  if (filled !== 0 && filled !== 3) {
    ctx.addIssue({
      code: 'custom',
      path: ['councilNumber'],
      message: professionalMessages.councilIncomplete,
    })
  }
}

/**
 * `isActive` NÃO entra no formulário.
 *
 * Desativar tira o profissional da agenda de toda a clínica. Um checkbox no
 * meio de um formulário de nome e conselho esconderia esse efeito atrás de um
 * "salvar" — é ação própria, com botão próprio e confirmação visível.
 *
 * `agendaColor` também fica de fora: ver `colorUnavailable`.
 */
export const createProfessionalSchema = z
  .object(professionalShape)
  .superRefine(councilMustBeComplete)
export type CreateProfessionalInput = z.infer<typeof createProfessionalSchema>

export const updateProfessionalSchema = z
  .object({
    professionalId: z.uuid(professionalMessages.notFound),
    ...professionalShape,
  })
  .superRefine(councilMustBeComplete)
export type UpdateProfessionalInput = z.infer<typeof updateProfessionalSchema>

export const setProfessionalActiveSchema = z.object({
  professionalId: z.uuid(professionalMessages.notFound),
  isActive: z.boolean(),
})
export type SetProfessionalActiveInput = z.infer<typeof setProfessionalActiveSchema>

export interface ProfessionalDto {
  id: string
  displayName: string
  councilType: string | null
  councilNumber: string | null
  councilState: string | null
  /** Já formatado — 'CRM 12345/SP' — ou null quando não informado. */
  council: string | null
  specialties: readonly string[]
  defaultSlotMinutes: number
  isActive: boolean
  /** `profiles.id` do membro vinculado, ou null. A tela usa para pré-selecionar. */
  linkedUserId: string | null
  /** Regra de domínio, resolvida no servidor. Ver `canSign`. */
  canSign: boolean
}

/** Um membro da clínica que pode ser vinculado a um cadastro de profissional. */
export interface LinkableMemberDto {
  userId: string
  name: string
}

export interface ProfessionalFormValues {
  displayName: string
  councilType: string
  councilNumber: string
  councilState: string
  specialties: string
  defaultSlotMinutes: string
  userId: string
}
