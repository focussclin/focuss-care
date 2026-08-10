import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import type { RoomKind } from '../domain/Room'

/**
 * Tipos locais para a relação nova enquanto o schema remoto não foi aplicado.
 *
 * O cliente real continua sendo o Supabase autenticado recebido pelo pipeline;
 * este contrato só evita editar `database.types.ts` gerado manualmente. Depois
 * da migration, `npm run db:types` passa a ser a fonte oficial e este arquivo
 * pode ser removido.
 */
export interface RoomRow {
  id: string
  clinic_id: string
  name: string
  kind: RoomKind
  capacity: number | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface RoomInsert {
  clinic_id: string
  name: string
  kind: RoomKind
  capacity: number | null
  notes: string | null
  is_active: boolean
}

export interface RoomUpdate {
  name?: string
  kind?: RoomKind
  capacity?: number | null
  notes?: string | null
  is_active?: boolean
  updated_at?: string
  /**
   * Remoção lógica. Só `archive` a escreve, e sempre junto de `is_active`.
   *
   * A coluna existia na migration desde 09/08 e **nenhum caminho do produto a
   * preenchia** — a leitura a respeitava (`.is('deleted_at', null)`) e nada a
   * definia. Uma sala criada por engano ficava para sempre, e o nome dela
   * também, porque o índice único é parcial nesta coluna.
   */
  deleted_at?: string | null
}

export interface RoomQueryError {
  code?: string | null
  message?: string | null
}

export interface RoomQueryResponse<T> {
  data: T
  error: RoomQueryError | null
}

export interface RoomQueryBuilder
  extends PromiseLike<RoomQueryResponse<readonly RoomRow[] | null>> {
  eq(column: string, value: string): RoomQueryBuilder
  is(column: string, value: null): RoomQueryBuilder
  order(column: string, options: { ascending: boolean }): RoomQueryBuilder
  select(columns: string): RoomQueryBuilder
  single(): PromiseLike<RoomQueryResponse<RoomRow | null>>
  maybeSingle(): PromiseLike<RoomQueryResponse<RoomRow | null>>
}

export interface RoomsClient {
  from(relation: 'rooms'): {
    select(columns: string): RoomQueryBuilder
    insert(values: RoomInsert): RoomQueryBuilder
    update(values: RoomUpdate): RoomQueryBuilder
  }
}

export function asRoomsClient(client: SupabaseClient<Database>): RoomsClient {
  return client as unknown as RoomsClient
}
