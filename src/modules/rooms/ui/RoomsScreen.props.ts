/**
 * Contrato da tela de salas e recursos.
 *
 * A view recebe dados e callbacks serializáveis; ela não conhece Supabase,
 * Server Actions ou a forma como o tenant foi resolvido.
 */
import type { RoomDto, RoomFormValues } from '../schemas/room.schema'

export type { RoomDto, RoomFormValues } from '../schemas/room.schema'
export type { RoomKind } from '../domain/Room'

export interface RoomsScreenProps {
  /** Já agrupadas e ordenadas pela rota: consultórios primeiro. */
  rooms: readonly RoomDto[]
  /** Criação e edição usam o mesmo envio. */
  onSubmit: (
    values: RoomFormValues,
    roomId: string | null,
  ) => Promise<string | null>
  /** Desativar e reativar são a mesma transição, com sinal diferente. */
  onToggleActive: (roomId: string, isActive: boolean) => Promise<string | null>
  /** Falso é demonstração local: nenhuma escrita acontece. */
  isLive: boolean
  /** A migration ainda não está disponível no Postgres conectado. */
  schemaPending?: boolean
}
