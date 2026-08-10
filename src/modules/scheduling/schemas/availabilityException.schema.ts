import { z } from 'zod'

import type { AvailabilityKind } from '@/lib/supabase/database.types'

import { AVAILABILITY_KINDS } from '../domain/AvailabilityException'

export const availabilityMessages = {
  invalidFields: 'Revise os campos destacados e tente novamente.',
  kindInvalid: 'Escolha bloquear ou abrir horário extra.',
  dateInvalid: 'Informe uma data e hora válidas.',
  windowInverted: 'O fim precisa ser depois do início.',
  windowTooLong: 'Use uma janela de no máximo 90 dias.',
  reasonTooLong: 'Use no máximo 240 caracteres no motivo.',
  hasAppointments:
    'Há atendimentos marcados dentro desta janela. Remarque ou cancele antes de bloquear — criar o bloqueio não move nenhum deles.',
  forbidden: 'Você não tem permissão para gerenciar a agenda desta clínica.',
  notFound: 'Esta exceção não está mais disponível nesta clínica.',
  writeForbidden:
    'A lista foi carregada, mas o banco recusou a gravação. Falta policy de escrita em `availability_exceptions` para este papel.',
  unavailable: 'Não foi possível falar com o servidor agora. Tente novamente.',
  unexpected: 'Não foi possível concluir a ação agora. Tente novamente.',
} as const

/** 90 dias: janela maior quase sempre é erro de digitação no ano. */
const MAX_WINDOW_DAYS = 90

const localDateTime = z
  .string()
  .trim()
  .min(1, availabilityMessages.dateInvalid)
  .refine((value) => !Number.isNaN(new Date(value).getTime()), availabilityMessages.dateInvalid)

export const createAvailabilityExceptionSchema = z
  .object({
    /*
     * Vazio vira `null` — a clínica inteira.
     *
     * Feriado não é ausência de ninguém, e a coluna é nullable no banco
     * exatamente para isso. Exigir um profissional obrigaria a criar uma
     * exceção por pessoa para fechar a clínica num dia só.
     */
    professionalId: z
      .union([z.literal(''), z.null(), z.uuid(availabilityMessages.invalidFields)])
      .transform((value) => value || null),
    kind: z.enum(AVAILABILITY_KINDS, availabilityMessages.kindInvalid),
    startsAt: localDateTime,
    endsAt: localDateTime,
    reason: z
      .union([z.literal(''), z.string().trim().max(240, availabilityMessages.reasonTooLong)])
      .transform((value) => value || null),
  })
  .superRefine((value, context) => {
    const start = new Date(value.startsAt).getTime()
    const end = new Date(value.endsAt).getTime()

    if (end <= start) {
      context.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: availabilityMessages.windowInverted,
      })
      return
    }

    if (end - start > MAX_WINDOW_DAYS * 24 * 60 * 60 * 1000) {
      context.addIssue({
        code: 'custom',
        path: ['endsAt'],
        message: availabilityMessages.windowTooLong,
      })
    }
  })
export type CreateAvailabilityExceptionInput = z.infer<
  typeof createAvailabilityExceptionSchema
>

export const removeAvailabilityExceptionSchema = z.object({
  exceptionId: z.uuid(availabilityMessages.notFound),
})
export type RemoveAvailabilityExceptionInput = z.infer<
  typeof removeAvailabilityExceptionSchema
>

export interface AvailabilityExceptionDto {
  id: string
  professionalId: string | null
  professionalName: string | null
  kind: AvailabilityKind
  startsAt: string
  endsAt: string
  reason: string | null
}

export interface AvailabilityExceptionFormValues {
  professionalId: string
  kind: AvailabilityKind
  startsAt: string
  endsAt: string
  reason: string
}
