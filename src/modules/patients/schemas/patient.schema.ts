import { z } from 'zod'

import { normalizePhone } from '@/lib/utils/phone'

export const patientMessages = {
  nameRequired: 'Informe o nome completo.',
  nameTooLong: 'O nome pode ter no máximo 160 caracteres.',
  phoneRequired: 'Informe um telefone para contato.',
  phoneInvalid: 'Informe um telefone com DDD. Exemplo: (11) 90000-0000.',
  emailTooLong: 'O e-mail pode ter no máximo 254 caracteres.',
  notesTooLong: 'A observação pode ter no máximo 2000 caracteres.',
  invalidEmail: 'Digite um e-mail válido.',
} as const

export const contactPreferenceOptions = [
  { value: 'WhatsApp', label: 'WhatsApp' },
  { value: 'Telefone', label: 'Telefone' },
  { value: 'E-mail', label: 'E-mail' },
] as const

export const newPatientSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, patientMessages.nameRequired)
    .max(160, patientMessages.nameTooLong),
  email: z
    .string()
    .trim()
    .max(254, patientMessages.emailTooLong)
    .email(patientMessages.invalidEmail)
    .or(z.literal(''))
    .optional(),
  phone: z
    .string()
    .trim()
    .min(1, patientMessages.phoneRequired)
    .refine((value) => normalizePhone(value) !== null, patientMessages.phoneInvalid),
  birthDate: z.string().optional(),
  contactPreference: z.enum(['WhatsApp', 'Telefone', 'E-mail']),
  notes: z.string().max(2000, patientMessages.notesTooLong).optional(),
})

export type NewPatientInput = z.infer<typeof newPatientSchema>

/**
 * Contrato do formulario de EDICAO.
 *
 * Duas diferencas em relacao ao cadastro, e as duas espelham `updatePatientSchema`:
 *
 *  1. **Sem preferencia de contato.** Nao ha coluna: o cadastro coleta e o servidor
 *     descarta. Repetir o campo aqui seria pior — ele apareceria sempre com o mesmo
 *     valor padrao e passaria por "dado do paciente".
 *  2. **Telefone pode ficar vazio.** Apagar um telefone e uma edicao legitima, e
 *     `patients.phone` e nullable: existe cadastro sem telefone nenhum. Enquanto o
 *     formulario exigia o campo, essas linhas simplesmente nao podiam ser salvas —
 *     o servidor ja aceitava, e a tela e que barrava.
 *
 * Continua sem `transform`, como todo contrato de formulario deste arquivo:
 * normalizar e trabalho do servidor, e o campo tem de continuar exibindo o que o
 * usuario digitou.
 */
export const editPatientFormSchema = newPatientSchema
  .omit({ contactPreference: true })
  .extend({
    phone: z
      .string()
      .trim()
      .refine(
        (value) => value === '' || normalizePhone(value) !== null,
        patientMessages.phoneInvalid,
      ),
  })

export type EditPatientFormInput = z.infer<typeof editPatientFormSchema>

// ---------------------------------------------------------------------------
// Contrato do servidor
// ---------------------------------------------------------------------------

/**
 * Mensagens que so o servidor produz. Ficam separadas de `patientMessages` porque
 * respondem a checagens que o formulario nao faz — e porque nenhuma delas pode
 * carregar detalhe de banco (docs/06-acoes-e-auditoria.md, secao 2).
 */
export const createPatientMessages = {
  nameTooLong: 'O nome pode ter no máximo 160 caracteres.',
  phoneInvalid: 'Informe um telefone com DDD. Exemplo: (11) 90000-0000.',
  emailTooLong: 'O e-mail pode ter no máximo 254 caracteres.',
  birthDateInvalid: 'Informe uma data de nascimento válida.',
  birthDateInFuture: 'A data de nascimento não pode estar no futuro.',
  birthDateTooOld: 'Confira a data de nascimento.',
  notesTooLong: 'A observação pode ter no máximo 2000 caracteres.',
  /** Resumo exibido no topo do formulário quando o servidor recusa a entrada. */
  invalidFields: 'Revise os campos destacados e tente novamente.',
  conflict: 'Já existe um paciente com esses dados nesta clínica.',
  forbidden: 'Você não tem permissão para cadastrar pacientes.',
  forbiddenEdit: 'Você não tem permissão para alterar pacientes.',
  notFound: 'Este paciente não está mais disponível nesta clínica.',
  unexpectedEdit: 'Não foi possível salvar as alterações agora. Tente novamente.',
  unexpectedArchive:
    'Não foi possível alterar o status do paciente agora. Tente novamente.',
  unavailable: 'Não foi possível falar com o servidor agora. Tente novamente.',
  unexpected: 'Não foi possível cadastrar o paciente agora. Tente novamente.',
} as const

const emailFormat = z.email()

/** Data de calendario real em 'YYYY-MM-DD' — ou null. */
function parseCalendarDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null

  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return null

  // O construtor "conserta" 2026-02-31 para 2026-03-03. Comparar de volta e o que
  // recusa a data que nao existe no calendario.
  return date.toISOString().slice(0, 10) === value ? date : null
}

/**
 * Contrato de escrita, reaplicado no servidor.
 *
 * Tres coisas que este schema faz e o do formulario nao:
 *
 *  1. **Normaliza.** Telefone vira digitos, e-mail vira minusculo, campo vazio
 *     vira `null` — o banco recebe uma forma so, nao o que cada usuario digitou.
 *  2. **Descarta o que nao tem coluna.** `contactPreference` chega do formulario e
 *     e removido aqui (`z.object` ignora chave desconhecida): o schema remoto nao
 *     tem preferencia de contato, e inventar uma coluna seria migration.
 *  3. **Nao aceita `clinicId` nem `createdBy`.** Os dois saem do `ActionContext`.
 *     Nao ha campo por onde o cliente os mandar.
 */
export const createPatientSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, patientMessages.nameRequired)
    .max(160, createPatientMessages.nameTooLong),

  phone: z
    .string()
    .trim()
    .min(1, patientMessages.phoneRequired)
    .refine(
      (value) => normalizePhone(value) !== null,
      createPatientMessages.phoneInvalid,
    )
    // `refine` acima ja garantiu que ha forma canonica; o `?? ''` existe so para
    // nao precisar de assercao de tipo.
    .transform((value) => normalizePhone(value) ?? ''),

  email: z
    .string()
    .optional()
    .transform((value) => value?.trim().toLowerCase() ?? '')
    .refine(
      (value) => value.length <= 254,
      createPatientMessages.emailTooLong,
    )
    .refine(
      (value) => value === '' || emailFormat.safeParse(value).success,
      patientMessages.invalidEmail,
    )
    .transform((value) => (value === '' ? null : value)),

  birthDate: z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? '')
    .refine(
      (value) => value === '' || parseCalendarDate(value) !== null,
      createPatientMessages.birthDateInvalid,
    )
    .refine((value) => {
      const date = value === '' ? null : parseCalendarDate(value)
      return date === null || date.getTime() <= Date.now()
    }, createPatientMessages.birthDateInFuture)
    .refine((value) => {
      const date = value === '' ? null : parseCalendarDate(value)
      return date === null || date.getUTCFullYear() >= 1900
    }, createPatientMessages.birthDateTooOld)
    .transform((value) => (value === '' ? null : value)),

  notes: z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? '')
    .refine(
      (value) => value.length <= 2000,
      createPatientMessages.notesTooLong,
    )
    .transform((value) => (value === '' ? null : value)),
})

/** Entrada ja normalizada que o caso de uso recebe. */
export type CreatePatientInput = z.infer<typeof createPatientSchema>

/**
 * Edicao: os mesmos campos, mais o alvo.
 *
 * `patientId` **pode** vir do cliente — e o unico identificador que ele tem o
 * direito de escolher, porque diz O QUE editar, nao ONDE. A clinica continua
 * saindo do `ActionContext`, e o repositorio filtra por ela: um id de outra
 * clinica nao acha linha nenhuma e volta como 'not-found', sem revelar que o id
 * existe em algum lugar.
 */
const editablePhoneSchema = z
  .string()
  .trim()
  .refine(
    (value) => value === '' || normalizePhone(value) !== null,
    createPatientMessages.phoneInvalid,
  )
  .transform((value) => (value === '' ? null : normalizePhone(value)))

export const updatePatientSchema = createPatientSchema.extend({
  phone: editablePhoneSchema,
  patientId: z.uuid(createPatientMessages.unexpected),
})

export type UpdatePatientInput = z.infer<typeof updatePatientSchema>

/** Arquivar e reativar sao a mesma operacao com sinal trocado. */
export const archivePatientSchema = z.object({
  patientId: z.uuid(createPatientMessages.unexpected),
  archived: z.boolean(),
})

export type ArchivePatientInput = z.infer<typeof archivePatientSchema>

/** Campos que a view sabe marcar — limita `fieldErrors` ao que existe na tela. */
export type CreatePatientField = keyof NewPatientInput

/**
 * O que as Server Actions de paciente devolvem ao cliente.
 *
 * Somente escalares: `Date` e linha crua do Supabase nao atravessam a fronteira
 * (docs/06-acoes-e-auditoria.md, secao 2). O container remonta o que a tela precisa.
 */
export interface PatientDto {
  id: string
  name: string
  /** Ja formatado para exibicao — mesma forma que a listagem mostra. */
  phone: string
  email: string
  /** ISO 'YYYY-MM-DD', ou null. */
  birthDate: string | null
  /** ISO 8601 completo, em UTC. */
  createdAt: string
  /** `false` significa arquivado. */
  isActive: boolean
}

/** Filtros da listagem (PATIENTS_DESIGN.md, secao "Busca e filtros"). */
export const statusFilterOptions = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Ativos' },
  { value: 'inactive', label: 'Inativos' },
] as const

export const lastVisitFilterOptions = [
  { value: 'any', label: 'Qualquer período' },
  { value: 'last-30', label: 'Últimos 30 dias' },
  { value: 'over-90', label: 'Mais de 90 dias' },
] as const

export type StatusFilter = (typeof statusFilterOptions)[number]['value']
export type LastVisitFilter = (typeof lastVisitFilterOptions)[number]['value']
