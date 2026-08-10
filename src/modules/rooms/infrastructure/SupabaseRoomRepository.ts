import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import type { NewRoomData, Room, RoomUpdateData } from '../domain/Room'
import type { RoomRepository } from '../domain/RoomRepository'
import { RoomRepositoryError } from '../domain/RoomRepositoryError'
import { asRoomsClient, type RoomRow } from './roomsDatabase'

const ROOM_SELECT =
  'id, clinic_id, name, kind, capacity, notes, is_active, created_at, updated_at, deleted_at'

export class SupabaseRoomRepository implements RoomRepository {
  private readonly client

  constructor(client: SupabaseClient<Database>) {
    this.client = asRoomsClient(client)
  }

  async list(clinicId: string): Promise<Room[]> {
    const { data, error } = await this.client
      .from('rooms')
      .select(ROOM_SELECT)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)
      .order('kind', { ascending: true })
      .order('name', { ascending: true })

    if (error) throw toReadError('list', error)

    return (data ?? []).map((row) => toRoom(row as unknown as RoomRow))
  }

  async create(clinicId: string, data: NewRoomData): Promise<Room> {
    const { data: row, error } = await this.client
      .from('rooms')
      .insert({
        clinic_id: clinicId,
        name: data.name,
        kind: data.kind,
        capacity: data.capacity,
        notes: data.notes || null,
        is_active: true,
      })
      .select(ROOM_SELECT)
      .single()

    if (error) throw toWriteError(error)
    return toRoom(row as unknown as RoomRow)
  }

  async update(
    clinicId: string,
    roomId: string,
    data: RoomUpdateData,
  ): Promise<Room> {
    const { data: row, error } = await this.client
      .from('rooms')
      .update({
        name: data.name,
        kind: data.kind,
        capacity: data.capacity,
        notes: data.notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('clinic_id', clinicId)
      .eq('id', roomId)
      .is('deleted_at', null)
      .select(ROOM_SELECT)
      .maybeSingle()

    if (error) throw toWriteError(error)
    if (!row) throw notFound(roomId)
    return toRoom(row as unknown as RoomRow)
  }

  async setActive(
    clinicId: string,
    roomId: string,
    isActive: boolean,
  ): Promise<Room> {
    const now = new Date().toISOString()
    const { data: row, error } = await this.client
      .from('rooms')
      .update({ is_active: isActive, updated_at: now })
      .eq('clinic_id', clinicId)
      .eq('id', roomId)
      .is('deleted_at', null)
      .select(ROOM_SELECT)
      .maybeSingle()

    if (error) throw toWriteError(error)
    if (!row) throw notFound(roomId)
    return toRoom(row as unknown as RoomRow)
  }

  async archive(clinicId: string, roomId: string): Promise<void> {
    /*
     * `deleted_at` E `is_active` juntos.
     *
     * O primeiro tira a linha de toda leitura e libera o nome no índice único
     * parcial; o segundo evita que uma consulta que só filtre por `is_active`
     * — hoje não existe, amanhã pode — devolva uma sala removida.
     *
     * `.is('deleted_at', null)` no filtro faz a segunda chamada não encontrar
     * nada, e o `not-found` que sai daí é a resposta certa: já foi removida.
     */
    const now = new Date().toISOString()

    const { data: row, error } = await this.client
      .from('rooms')
      .update({ deleted_at: now, is_active: false, updated_at: now })
      .eq('clinic_id', clinicId)
      .eq('id', roomId)
      .is('deleted_at', null)
      .select(ROOM_SELECT)
      .maybeSingle()

    if (error) throw toWriteError(error)
    if (!row) throw notFound(roomId)
  }
}

function toRoom(row: RoomRow): Room {
  return {
    id: row.id,
    clinicId: row.clinic_id,
    name: row.name,
    kind: row.kind,
    capacity: row.capacity,
    notes: row.notes,
    isActive: row.is_active,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

function notFound(roomId: string): RoomRepositoryError {
  return new RoomRepositoryError(
    'not-found',
    `recurso ${roomId} não encontrado na clínica ativa`,
  )
}

function toReadError(
  context: string,
  error: { code?: string | null; message?: string | null },
): RoomRepositoryError {
  console.error(`[rooms] leitura ${context}`, {
    code: error.code ?? null,
    message: error.message ?? null,
  })

  return new RoomRepositoryError(
    classify(error),
    error.message ?? 'falha ao carregar salas',
    error.code ?? undefined,
  )
}

/**
 * Recusa de ESCRITA, classificada com o mesmo critério da leitura.
 *
 * Antes, esta função só reconhecia `23505` e mandava todo o resto para
 * `unexpected` — o que tornava dois ramos de `roomFailure` inalcançáveis a
 * partir de qualquer escrita:
 *
 *  - com a migration pendente, criar uma sala respondia "não foi possível
 *    concluir a ação agora" em vez de dizer que a tabela não existe. A pessoa
 *    tentava de novo, para sempre, sobre um problema que nenhuma tentativa
 *    resolve;
 *  - a recusa da policy virava "erro inesperado" em vez de "você não tem
 *    permissão", que é a única das duas que diz o que fazer.
 *
 * A leitura já classificava certo. Era a escrita que perdia a informação.
 */
function toWriteError(error: {
  code?: string | null
  message?: string | null
}): RoomRepositoryError {
  const code = error.code ?? undefined
  const message = error.message ?? 'sem mensagem'

  // Nome repetido é o único conflito possível aqui, e o índice é parcial:
  // `(clinic_id, lower(name)) where deleted_at is null`.
  if (code === '23505') {
    return new RoomRepositoryError('conflict', message, code)
  }

  return new RoomRepositoryError(classify(error), message, code)
}

function classify(error: {
  code?: string | null
  message?: string | null
}): RoomRepositoryError['reason'] {
  const code = error.code ?? ''
  const message = error.message ?? ''

  if (code === '42P01' || code === 'PGRST205') return 'schema-not-ready'
  if (code === '42501' || code === 'PGRST301') return 'forbidden'
  if (/fetch|network|timeout|econnre/i.test(message)) return 'unavailable'
  return 'unexpected'
}
