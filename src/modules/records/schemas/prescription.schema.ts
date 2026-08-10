import { z } from 'zod'

import { MAX_ITEMS } from '../domain/Prescription'

export const prescriptionMessages = {
  invalidFields: 'Revise os campos destacados e tente novamente.',
  drugRequired: 'Informe o medicamento.',
  drugTooLong: 'Use no máximo 200 caracteres.',
  fieldTooLong: 'Use no máximo 120 caracteres.',
  instructionsTooLong: 'Use no máximo 500 caracteres nas orientações.',
  itemsRequired:
    'Adicione ao menos um item. Uma prescrição sem item apareceria no histórico como receita emitida, sem nada prescrito.',
  itemsTooMany: `Use no máximo ${MAX_ITEMS} itens por prescrição.`,
  validUntilInvalid: 'Informe uma data de validade válida.',
  validUntilPast: 'A validade não pode ser anterior à emissão.',
  notAProfessional:
    'Só quem tem cadastro de profissional na clínica pode prescrever. Peça a alguém com acesso à equipe para vincular seu usuário a um profissional.',
  forbidden: 'Você não tem permissão para prescrever nesta clínica.',
  notFound: 'Este paciente não está mais disponível nesta clínica.',
  encounterMismatch:
    'Este atendimento não pertence a este paciente. Recarregue a ficha e tente novamente.',
  unavailable: 'Não foi possível falar com o servidor agora. Tente novamente.',
  unexpected: 'Não foi possível concluir a ação agora. Tente novamente.',
  /** Exibido no painel. Ver o JSDoc do domínio. */
  noSignature:
    'As prescrições ficam registradas aqui, sem assinatura digital e sem emissão oficial: não há integração com emissor de receita nesta instalação. Impressão e entrega seguem o processo atual da clínica.',
} as const

/**
 * Opcional de verdade: aceita ausente, vazio ou texto.
 *
 * O formulário sempre manda a chave, mas quem chama a action direto não é
 * obrigado a montar sete campos vazios para prescrever um medicamento só. Um
 * item pode ser apenas o nome.
 */
const optionalText = (max: number, message: string) =>
  z
    .union([z.literal(''), z.string().trim().max(max, message)])
    .optional()
    .transform((value) => value || null)

/**
 * Todos os campos do item são TEXTO LIVRE, e é assim que o banco os guarda.
 *
 * `dosage`, `route`, `frequency`, `duration` e `quantity` são `text`. Não há
 * enum de via de administração nem unidade de dose para validar, e inventar um
 * obrigaria o profissional a caber numa lista que este código escolheu — além
 * de dar a impressão de que a aplicação confere a prescrição. Ela não confere:
 * guarda o que foi escrito.
 *
 * O limite de caracteres existe só para caber na tela e no papel.
 */
export const prescriptionItemSchema = z.object({
  drugName: z
    .string()
    .trim()
    .min(2, prescriptionMessages.drugRequired)
    .max(200, prescriptionMessages.drugTooLong),
  dosage: optionalText(120, prescriptionMessages.fieldTooLong),
  route: optionalText(120, prescriptionMessages.fieldTooLong),
  frequency: optionalText(120, prescriptionMessages.fieldTooLong),
  duration: optionalText(120, prescriptionMessages.fieldTooLong),
  quantity: optionalText(120, prescriptionMessages.fieldTooLong),
  instructions: optionalText(500, prescriptionMessages.instructionsTooLong),
})
export type PrescriptionItemInput = z.infer<typeof prescriptionItemSchema>

/**
 * `authorId`, `issuedAt`, `signedAt`, `signature`, `externalId` e `externalUrl`
 * NÃO entram neste schema, e cada ausência tem um motivo distinto:
 *
 *  - `authorId` sai de `current_professional_id()`, no servidor. Aceitá-lo do
 *    cliente deixaria alguém prescrever em nome de outro profissional.
 *  - `issuedAt` é o instante da gravação, e não uma data que se escolhe.
 *  - as quatro últimas pertencem a um emissor externo que não existe.
 */
export const createPrescriptionSchema = z.object({
  patientId: z.uuid(prescriptionMessages.notFound),
  encounterId: z
    .union([z.literal(''), z.null(), z.uuid(prescriptionMessages.invalidFields)])
    .transform((value) => value || null),
  validUntil: z
    .union([
      z.literal(''),
      z.null(),
      z
        .string()
        .trim()
        .refine(
          (value) => !Number.isNaN(new Date(value).getTime()),
          prescriptionMessages.validUntilInvalid,
        ),
    ])
    .transform((value) => value || null),
  items: z
    .array(prescriptionItemSchema)
    .min(1, prescriptionMessages.itemsRequired)
    .max(MAX_ITEMS, prescriptionMessages.itemsTooMany),
})
export type CreatePrescriptionInput = z.infer<typeof createPrescriptionSchema>

export interface PrescriptionItemDto {
  id: string
  drugName: string
  dosage: string | null
  route: string | null
  frequency: string | null
  duration: string | null
  quantity: string | null
  instructions: string | null
  sortOrder: number
}

export interface PrescriptionDto {
  id: string
  patientId: string
  encounterId: string | null
  authorName: string | null
  issuedAt: string
  validUntil: string | null
  /** Do emissor externo. Sempre nulo enquanto não houver integração. */
  signedAt: string | null
  /** Do emissor externo. Sempre nulo enquanto não houver integração. */
  externalUrl: string | null
  items: readonly PrescriptionItemDto[]
}

export interface PrescriptionItemFormValues {
  drugName: string
  dosage: string
  route: string
  frequency: string
  duration: string
  quantity: string
  instructions: string
}

export interface PrescriptionFormValues {
  validUntil: string
  items: PrescriptionItemFormValues[]
}
