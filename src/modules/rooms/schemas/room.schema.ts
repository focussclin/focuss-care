import { z } from 'zod'

import type { RoomKind } from '../domain/Room'

export const roomMessages = {
  invalidFields: 'Revise os campos destacados e tente novamente.',
  nameRequired: 'Informe o nome da sala ou recurso.',
  nameTooLong: 'Use no máximo 80 caracteres.',
  kindRequired: 'Escolha o tipo do recurso.',
  capacityInvalid: 'A capacidade deve ser um número inteiro entre 1 e 999.',
  notesTooLong: 'Use no máximo 500 caracteres nas observações.',
  /*
   * A frase diz onde procurar, porque o índice único é PARCIAL
   * (`where deleted_at is null`): uma sala DESATIVADA continua ocupando o nome,
   * e ela aparece na lista com o rótulo "Inativa". Sem essa pista, quem acabou
   * de desativar "Sala 1" e tenta criar outra conclui que o sistema está errado.
   */
  duplicate:
    'Já existe uma sala ou recurso com esse nome — inclusive entre os inativos. Remova o antigo ou escolha outro nome.',
  forbidden: 'Você não tem permissão para gerenciar salas e recursos.',
  notFound: 'Este recurso não está mais disponível nesta clínica.',
  schemaPending:
    'O cadastro de salas ainda está sendo preparado no banco. Aplique a migration indicada e tente novamente.',
  unavailable: 'Não foi possível falar com o servidor agora. Tente novamente.',
  unexpected: 'Não foi possível concluir a ação agora. Tente novamente.',
} as const

const roomKinds = [
  'consultorio',
  'sala_exame',
  'sala_procedimento',
  'equipamento',
] as const satisfies readonly RoomKind[]

const roomDataShape = {
  name: z
    .string()
    .trim()
    .min(2, roomMessages.nameRequired)
    .max(80, roomMessages.nameTooLong),
  kind: z.enum(roomKinds, roomMessages.kindRequired),
  capacity: z
    .union([
      z.null(),
      z
        .number()
        .int(roomMessages.capacityInvalid)
        .min(1, roomMessages.capacityInvalid)
        .max(999, roomMessages.capacityInvalid),
    ])
    .default(null),
  notes: z
    .string()
    .trim()
    .max(500, roomMessages.notesTooLong)
    .default(''),
}

export const createRoomSchema = z.object(roomDataShape)
export type CreateRoomInput = z.infer<typeof createRoomSchema>

export const updateRoomSchema = z.object({
  roomId: z.uuid(roomMessages.unexpected),
  ...roomDataShape,
})
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>

export const toggleRoomActiveSchema = z.object({
  roomId: z.uuid(roomMessages.unexpected),
  isActive: z.boolean(),
})
export type ToggleRoomActiveInput = z.infer<typeof toggleRoomActiveSchema>

export const archiveRoomSchema = z.object({
  roomId: z.uuid(roomMessages.unexpected),
})
export type ArchiveRoomInput = z.infer<typeof archiveRoomSchema>

export interface RoomDto {
  id: string
  name: string
  kind: RoomKind
  capacity: number | null
  notes: string | null
  isActive: boolean
}

/** Um tipo de recurso e o que a clínica tem dele. Grupo vazio não é montado. */
export interface RoomGroupDto {
  kind: RoomKind
  rooms: readonly RoomDto[]
}

export interface RoomFormValues {
  name: string
  kind: RoomKind
  capacity: number | null
  notes: string
}
