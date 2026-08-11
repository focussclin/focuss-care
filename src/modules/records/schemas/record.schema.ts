import { z } from 'zod'

import type {
  RecordEncounterStatus,
  RecordType,
} from '../domain/MedicalRecord'

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
  /**
   * O atendimento escolhido não é desta clínica, ou não é deste paciente.
   *
   * Não diz "não encontrado": em quase todo caso real a causa é o paciente ter
   * sido trocado depois de o atendimento já estar escolhido, e "selecione o
   * atendimento de novo" é a instrução que resolve.
   */
  encounterMismatch:
    'O atendimento escolhido não é deste paciente. Selecione o atendimento novamente.',
  encountersUnavailable:
    'Não foi possível carregar os atendimentos deste paciente. O registro pode ser salvo sem vínculo.',
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
 * Quantos atendimentos o seletor de vínculo oferece.
 *
 * Curto de propósito: é uma lista de escolha, não um histórico. Quem procura
 * um atendimento de meses atrás está reconstituindo prontuário antigo, e isso
 * não se faz por um `<select>` de dez itens.
 */
export const RECORD_ENCOUNTER_LIMIT = 10

export const listRecordEncountersSchema = z.object({
  patientId: z.uuid(recordMessages.patientRequired),
})

export type ListRecordEncountersInput = z.infer<
  typeof listRecordEncountersSchema
>

/**
 * O atendimento como o formulário e a lista o exibem.
 *
 * `chiefComplaint` atravessa a fronteira porque é conteúdo clínico servindo a
 * quem tem `record.read` — as duas superfícies que o consomem (a tela de
 * prontuários e o seletor de vínculo) já exigem essa permissão antes de
 * existir. Nenhuma tela operacional recebe este DTO.
 */
export interface RecordEncounterDto {
  id: string
  status: RecordEncounterStatus
  /** ISO 8601 completo, em UTC. */
  startedAt: string
  endedAt: string | null
  professionalName: string | null
  chiefComplaint: string | null
}

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
  /**
   * O atendimento vinculado, quando foi possível lê-lo.
   *
   * Ausente é diferente de sem vínculo — quem responde isso é `encounterId`.
   * Ver o JSDoc de `MedicalRecord.encounter`.
   */
  encounter: RecordEncounterDto | null
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
