import { z } from 'zod'

import type { RecordType } from '../domain/MedicalRecord'

export const recordMessages = {
  invalidFields: 'Revise os campos destacados e tente novamente.',
  patientRequired: 'Selecione o paciente.',
  contentRequired: 'Escreva o registro antes de salvar.',
  contentTooLong: 'O registro pode ter no máximo 20.000 caracteres.',
  /**
   * A recusa mais específica desta tela — e a que não é sobre permissão.
   *
   * Quem recebe "sem permissão" tenta de novo; quem recebe isto entende que
   * precisa chamar quem assina. Recepção e financeiro têm usuário e não têm
   * cadastro de profissional, e prontuário é ato clínico.
   */
  notAProfessional:
    'Apenas profissionais de saúde cadastrados nesta clínica podem registrar no prontuário.',
  superseded:
    'Este registro já foi corrigido por outra pessoa. Atualize para ver a versão mais recente.',
  forbidden: 'Você não tem acesso ao prontuário desta clínica.',
  notFound: 'Este registro não está mais disponível nesta clínica.',
  unavailable: 'Não foi possível falar com o servidor agora. Tente novamente.',
  unexpected: 'Não foi possível salvar o registro agora. Tente novamente.',
} as const

/** Tipos que o formulário oferece hoje — o enum do banco tem mais. */
export const recordTypeOptions = [
  { value: 'evolution', label: 'Evolução clínica' },
  { value: 'anamnesis', label: 'Anamnese' },
  { value: 'physical_exam', label: 'Exame físico' },
  { value: 'diagnosis', label: 'Diagnóstico' },
  { value: 'procedure', label: 'Procedimento' },
  { value: 'note', label: 'Nota' },
] as const satisfies readonly { value: RecordType; label: string }[]

const recordTypeValues = [
  'anamnesis',
  'evolution',
  'physical_exam',
  'diagnosis',
  'procedure',
  'exam_request',
  'referral',
  'certificate',
  'note',
] as const satisfies readonly RecordType[]

/**
 * Teto do conteúdo.
 *
 * Generoso de propósito: uma anamnese completa é longa, e cortar registro
 * clínico por limite apertado faria o profissional escrever em dois pedaços —
 * o que é pior para quem lê depois.
 */
const MAX_CONTENT = 20_000

const contentField = z
  .string()
  .trim()
  .min(1, recordMessages.contentRequired)
  .max(MAX_CONTENT, recordMessages.contentTooLong)

export const createRecordSchema = z.object({
  patientId: z.uuid(recordMessages.patientRequired),
  encounterId: z
    .string()
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null))
    .refine(
      (value) => value === null || z.uuid().safeParse(value).success,
      recordMessages.unexpected,
    ),
  recordType: z.enum(recordTypeValues).catch('evolution'),
  content: contentField,
})

export type CreateRecordInput = z.infer<typeof createRecordSchema>

/**
 * Correção.
 *
 * Só `recordId` e `content`. Paciente, atendimento e tipo são herdados da
 * versão anterior pelo adapter — corrigir o texto não pode, por acidente,
 * mudar de quem é o registro.
 */
export const amendRecordSchema = z.object({
  recordId: z.uuid(recordMessages.unexpected),
  content: contentField,
})

export type AmendRecordInput = z.infer<typeof amendRecordSchema>

/**
 * O que as Server Actions devolvem ao cliente.
 *
 * `content` está aqui porque a tela precisa mostrar o registro que acabou de
 * ser salvo — é a mesma informação que o profissional digitou, voltando para a
 * mesma pessoa. O que NÃO atravessa é `content_hash` e o jsonb bruto: nenhum
 * dos dois tem uso na tela, e o hash é dado de integridade, não de exibição.
 */
export interface MedicalRecordDto {
  id: string
  patientId: string
  encounterId: string | null
  authorId: string
  authorName: string
  recordType: string
  content: string
  version: number
  supersedesId: string | null
  signedAt: string | null
  /** ISO 8601 completo, em UTC. */
  createdAt: string
}
