/**
 * CONTRATO da tela de salas e recursos — dono: Claude (código).
 *
 * A view (dono: Codex) implementa contra esta interface e **não** conhece
 * Supabase, Server Actions nem casos de uso. Ver `ROOMS_DESIGN.md` e a §5 de
 * `docs/02-estrutura-de-pastas.md`.
 *
 * # Estado desta fatia
 *
 * A tabela `rooms` **não existe no banco ainda**: a migration
 * `supabase/migrations/20260809_rooms.sql` está escrita e revisada, sem
 * aplicação. Este arquivo é o contrato acordado antes do resto — domínio, porta,
 * adapters, action e rota entram quando a tabela existir, e nenhum deles pode
 * ser escrito antes sob pena de consultar relação inexistente.
 */

/** Os quatro tipos do enum `room_kind` da migration. */
export type RoomKind =
  | 'consultorio'
  | 'sala_exame'
  | 'sala_procedimento'
  | 'equipamento'

export interface RoomDto {
  id: string
  name: string
  kind: RoomKind
  /** Null quando não se aplica — equipamento normalmente não tem. */
  capacity: number | null
  notes: string | null
  isActive: boolean
}

/** O que o formulário devolve, já validado pelo schema. */
export interface RoomFormValues {
  name: string
  kind: RoomKind
  capacity: number | null
  notes: string
}

export interface RoomsScreenProps {
  /** Já agrupadas e ordenadas pela rota: consultórios primeiro. */
  rooms: readonly RoomDto[]

  /**
   * Criação e edição usam o MESMO envio.
   *
   * `roomId` nulo é criação. Devolve mensagem de erro pronta para exibição, ou
   * null em caso de sucesso — a view não decide o texto da falha.
   */
  onSubmit: (
    values: RoomFormValues,
    roomId: string | null,
  ) => Promise<string | null>

  /** Desativar e reativar são a mesma transição, com sinal diferente. */
  onToggleActive: (roomId: string, isActive: boolean) => Promise<string | null>

  /**
   * Há banco por trás desta tela.
   *
   * Falso é demonstração local: a tela declara isso e nenhuma escrita acontece.
   */
  isLive: boolean
}
