import { z } from 'zod'

import { normalizePhone } from '@/lib/utils/phone'

export const profileMessages = {
  invalidFields: 'Revise os campos destacados e tente novamente.',
  nameRequired: 'Informe o seu nome.',
  nameTooShort: 'O nome precisa ter pelo menos 2 caracteres.',
  nameTooLong: 'O nome pode ter no máximo 120 caracteres.',
  nameInvalid: 'Use letras e números no nome.',
  phoneInvalid: 'Informe um telefone com DDD, como (11) 98812-4471.',
  /**
   * Perfil ausente.
   *
   * A sessão é válida e a linha de `profiles` não existe — o gatilho de criação
   * no cadastro não rodou. A mensagem diz o que aconteceu em vez de "sem
   * permissão", que mandaria a pessoa procurar quem a autorize.
   */
  notFound:
    'Não encontramos o seu perfil. Saia e entre novamente; se continuar, avise a equipe técnica.',
  forbidden: 'Você só pode alterar o seu próprio perfil.',
  unavailable: 'Não foi possível falar com o servidor agora. Tente novamente.',
  unexpected: 'Não foi possível salvar o seu perfil agora. Tente novamente.',
  /** Texto ao lado do e-mail, explicando por que ele não se edita aqui. */
  emailReadOnly:
    'O e-mail é o seu acesso ao sistema e muda pelo fluxo de autenticação, com confirmação no endereço novo.',
} as const

/** O nome precisa ter ao menos um caractere alfanumérico de verdade. */
const ALPHANUMERIC = /[\p{L}\p{N}]/u

/** Caracteres de controle não entram em campo que vira nome de pessoa. */
const CONTROL_CHARS = /\p{C}/u

export const updateProfileSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(1, profileMessages.nameRequired)
    .min(2, profileMessages.nameTooShort)
    .max(120, profileMessages.nameTooLong)
    .refine((value) => ALPHANUMERIC.test(value), profileMessages.nameInvalid)
    .refine(
      (value) => !CONTROL_CHARS.test(value),
      profileMessages.nameInvalid,
    ),
  /**
   * Telefone opcional, normalizado para dígitos.
   *
   * Campo vazio é ausência, não erro — nem todo mundo quer deixar telefone. Já
   * um valor preenchido que não vira DDD + número é erro: guardar '9999' faria a
   * clínica achar que tem um contato quando não tem.
   */
  phone: z
    .string()
    .optional()
    .transform((value) => value?.trim() ?? '')
    .transform((value, ctx) => {
      if (value === '') return null

      const normalized = normalizePhone(value)
      if (!normalized) {
        ctx.addIssue({ code: 'custom', message: profileMessages.phoneInvalid })
        return z.NEVER
      }

      return normalized
    }),
})

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>

/**
 * O que atravessa a fronteira da Server Action.
 *
 * `id` NÃO viaja: a tela nunca precisa dele — a action resolve o usuário pela
 * sessão — e um id que chega ao navegador só serve para alguém tentar mandá-lo
 * de volta.
 */
export interface ProfileDto {
  fullName: string
  email: string
  /** Dígitos canônicos, ou null. A tela formata para exibir. */
  phone: string | null
}
