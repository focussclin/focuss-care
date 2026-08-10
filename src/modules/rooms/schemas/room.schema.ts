import { z } from 'zod'

import type { RoomKind } from '../domain/Room'

export const roomMessages = {
  invalidFields: 'Revise os campos destacados e tente novamente.',
  nameRequired: 'Informe o nome da sala ou recurso.',
  nameTooLong: 'Use no máximo 80 caracteres.',
  kindRequired: 'Escolha o tipo do recurso.',
  capacityInvalid: 'A capacidade deve ser um número inteiro entre 1 e 999.',
  notesTooLong: 'Use no máximo 500 caracteres nas observações.',
  duplicate: 'Já existe uma sala ou recurso com esse nome.',
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

export interface RoomDto {
  id: string
  name: string
  kind: RoomKind
  capacity: number | null
  notes: string | null
  isActive: boolean
}

export interface RoomFormValues {
  name: string
  kind: RoomKind
  capacity: number | null
  notes: string
}
