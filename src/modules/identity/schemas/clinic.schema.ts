import { z } from 'zod'

/**
 * Contrato de dados do onboarding — a criacao da clinica.
 *
 * Os dois campos vao direto para `create_clinic(p_slug, p_trade_name)`, entao a
 * validacao aqui e a primeira (e nao a unica) linha de defesa: o banco tem
 * UNIQUE em `clinics.slug` e a RPC deriva o dono de `auth.uid()`.
 *
 * Mensagens centralizadas para que view, container e Server Action falem a mesma
 * lingua — e para que nenhuma delas vaze detalhe de banco para a tela.
 */
export const clinicMessages = {
  tradeNameRequired: 'Informe o nome da clínica.',
  tradeNameTooShort: 'O nome precisa ter pelo menos 2 caracteres.',
  tradeNameTooLong: 'O nome pode ter no máximo 120 caracteres.',
  tradeNameInvalid: 'Use letras e números no nome da clínica.',
  slugRequired: 'Informe o endereço da clínica.',
  slugTooShort: 'O endereço precisa ter pelo menos 3 caracteres.',
  slugTooLong: 'O endereço pode ter no máximo 48 caracteres.',
  slugInvalid:
    'Use apenas letras minúsculas, números e hífen (ex.: clinica-vida).',
  slugReserved: 'Este endereço não está disponível. Escolha outro.',
  slugTaken: 'Este endereço já está em uso. Escolha outro.',
  invalidFields: 'Revise os campos destacados e tente novamente.',
  alreadyHasClinic: 'Sua conta já está vinculada a uma clínica.',
  sessionExpired: 'Sua sessão expirou. Entre novamente para continuar.',
  claimsStale:
    'A clínica foi criada, mas sua sessão precisa ser renovada antes de continuar.',
  unexpected: 'Não foi possível criar a clínica agora. Tente novamente.',
} as const

/**
 * Enderecos que colidem com rotas da aplicacao ou com nomes que a operacao
 * precisa manter livres. Barrar aqui evita depender de uma constraint que o banco
 * nao tem.
 */
const reservedSlugs = new Set([
  'admin',
  'agenda',
  'api',
  'app',
  'auth',
  'cadastro',
  'configuracoes',
  'dashboard',
  'equipe',
  'focuss',
  'focusscare',
  'login',
  'onboarding',
  'pacientes',
  'public',
  'recuperar-senha',
  'redefinir-senha',
  'static',
  'suporte',
  'www',
])

/** Letras minusculas, numeros e hifens simples — sem hifen nas pontas. */
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** O nome precisa ter ao menos um caractere alfanumerico de verdade. */
const tradeNamePattern = /[\p{L}\p{N}]/u

/** Caracteres de controle nao entram em campo de texto que vira dado de tenant. */
const controlCharPattern = /\p{C}/u

export const tradeNameSchema = z
  .string()
  .trim()
  .min(1, clinicMessages.tradeNameRequired)
  .min(2, clinicMessages.tradeNameTooShort)
  .max(120, clinicMessages.tradeNameTooLong)
  .refine((value) => tradeNamePattern.test(value), clinicMessages.tradeNameInvalid)
  .refine((value) => !controlCharPattern.test(value), clinicMessages.tradeNameInvalid)

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, clinicMessages.slugRequired)
  .min(3, clinicMessages.slugTooShort)
  .max(48, clinicMessages.slugTooLong)
  .regex(slugPattern, clinicMessages.slugInvalid)
  .refine((value) => !reservedSlugs.has(value), clinicMessages.slugReserved)

export const createClinicSchema = z.object({
  tradeName: tradeNameSchema,
  slug: slugSchema,
})

export type CreateClinicInput = z.infer<typeof createClinicSchema>

/**
 * Deriva um endereco a partir do nome digitado.
 *
 * Roda no cliente apenas como sugestao — o que vale e o `slugSchema` acima, que
 * a Server Action reaplica. Acentos viram a letra base (NFD + remocao de
 * diacriticos) para que "Clínica Saúde" vire "clinica-saude".
 */
export function slugifyClinicName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '')
}
