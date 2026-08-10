/**
 * Contrato da tela de salas e recursos.
 *
 * A view recebe dados e callbacks serializáveis; ela não conhece Supabase,
 * Server Actions ou a forma como o tenant foi resolvido.
 */
import type { RoomFormValues, RoomGroupDto } from '../schemas/room.schema'

export type {
  RoomDto,
  RoomFormValues,
  RoomGroupDto,
} from '../schemas/room.schema'
export type { RoomKind } from '../domain/Room'

export interface RoomsScreenProps {
  /**
   * Grupos prontos, na ordem de `ROOM_KIND_ORDER`, sem grupo vazio.
   *
   * Recebe GRUPOS, e não a lista crua, porque a versão anterior desta linha
   * dizia "já agrupadas e ordenadas pela rota" sobre uma rota que só mapeava o
   * DTO — o agrupamento vivia num `reduce` dentro do componente. O contrato
   * agora descreve o que de fato chega.
   */
  groups: readonly RoomGroupDto[]
  /** Criação e edição usam o mesmo envio. */
  onSubmit: (
    values: RoomFormValues,
    roomId: string | null,
  ) => Promise<string | null>
  /** Desativar e reativar são a mesma transição, com sinal diferente. */
  onToggleActive: (roomId: string, isActive: boolean) => Promise<string | null>
  /**
   * REMOVE do cadastro (`deleted_at`), liberando o nome.
   *
   * Coisa diferente de desativar: aquela é "não use agora" e mantém o nome
   * ocupado no índice único parcial. Ver `RoomRepository.archive`.
   */
  onArchive: (roomId: string) => Promise<string | null>
  /** Falso é demonstração local: nenhuma escrita acontece. */
  isLive: boolean
  /** A migration ainda não está disponível no Postgres conectado. */
  schemaPending?: boolean
}
