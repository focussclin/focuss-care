import { z } from 'zod'

export const allergyMessages = {
  invalidFields: 'Revise os campos destacados e tente novamente.',
  substanceRequired: 'Informe a substância.',
  substanceTooLong: 'Use no máximo 120 caracteres.',
  reactionTooLong: 'Use no máximo 500 caracteres.',
  duplicate:
    'Esta substância já está registrada para o paciente. Edite a entrada existente em vez de criar uma segunda.',
  forbidden: 'Você não tem permissão para registrar alergias nesta clínica.',
  writeForbidden:
    'A ficha foi carregada, mas o banco recusou a gravação. Falta policy de escrita em `allergies` para este papel.',
  notFound: 'Este registro de alergia não está mais disponível.',
  unavailable: 'Não foi possível falar com o servidor agora. Tente novamente.',
  unexpected: 'Não foi possível concluir a ação agora. Tente novamente.',
  /**
   * Exibido junto da lista.
   *
   * A coluna `severity` existe no banco e fica vazia: sem saber se a escala vai
   * de 1 a 3 ou de 1 a 5, nem para que lado cresce, gravar um número é pior do
   * que não gravar — quem lê "2" assume a escala que conhece.
   */
  severityUnavailable:
    'A gravidade não é registrada aqui: a coluna `allergies.severity` guarda um número e a escala usada não pôde ser verificada. Descreva a reação em texto — é o que se lê antes de prescrever. Para destravar, rode no banco: select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = \'public.allergies\'::regclass;',
} as const

const substance = z
  .string()
  .trim()
  .min(2, allergyMessages.substanceRequired)
  .max(120, allergyMessages.substanceTooLong)

const reaction = z
  .union([z.literal(''), z.string().trim().max(500, allergyMessages.reactionTooLong)])
  .transform((value) => value || null)

/**
 * `severity` não entra em nenhum destes schemas, e a ausência é a decisão.
 *
 * Um campo aqui viraria um número gravado sob uma escala adivinhada — e a
 * gravidade de uma alergia é justamente o que alguém confere antes de aplicar
 * um medicamento. Ver `allergyMessages.severityUnavailable`.
 */
export const recordAllergySchema = z.object({
  patientId: z.uuid(allergyMessages.notFound),
  substance,
  reaction,
})
export type RecordAllergyInput = z.infer<typeof recordAllergySchema>

export const updateAllergySchema = z.object({
  allergyId: z.uuid(allergyMessages.notFound),
  substance,
  reaction,
})
export type UpdateAllergyInput = z.infer<typeof updateAllergySchema>

export const setAllergyActiveSchema = z.object({
  allergyId: z.uuid(allergyMessages.notFound),
  isActive: z.boolean(),
})
export type SetAllergyActiveInput = z.infer<typeof setAllergyActiveSchema>

export interface AllergyDto {
  id: string
  patientId: string
  substance: string
  reaction: string | null
  isActive: boolean
  recordedAt: string
}

export interface AllergyFormValues {
  substance: string
  reaction: string
}
