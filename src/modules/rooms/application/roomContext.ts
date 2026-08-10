import type { Room } from '../domain/Room'
import { isRoomRepositoryError } from '../domain/RoomRepositoryError'

/**
 * O que a agenda precisa saber sobre salas — e as duas perguntas são
 * DIFERENTES.
 *
 * Confundi-las foi um bug real: a rota decidia o `select` por `rooms.length`, e
 * uma clínica que aplicou a migration e desativou todas as salas (reforma,
 * mudança de endereço) tem a lista vazia com a **coluna existindo**. O `select`
 * omitia `room_id`, e os atendimentos que já tinham sala perdiam o nome dela na
 * grade — histórico apagado da tela por causa do estado presente do cadastro.
 */
export interface RoomContext {
  /**
   * O que pode ser RESERVADO agora. Só as ativas.
   *
   * Decide se o campo de sala aparece no formulário. Vazio é resposta legítima
   * de uma clínica que não cadastrou salas ou desativou todas.
   */
  rooms: Room[]
  /**
   * A tabela `rooms` existe no banco.
   *
   * Decide se o `select` da agenda pede `appointments.room_id`. Nada a ver com
   * haver sala cadastrada: responde sobre o SCHEMA, e a migration cria as duas
   * coisas juntas.
   */
  schemaReady: boolean
}

/**
 * Resultado da leitura de salas, antes de ser julgado.
 *
 * A função abaixo é pura, então o I/O fica fora dela: quem chama executa a
 * consulta e traz o desfecho. É o que torna cada ramo — inclusive os que
 * relançam — verificável sem banco, sem rede e sem mock de repositório.
 */
export type RoomLoad =
  | { status: 'loaded'; rooms: readonly Room[] }
  | { status: 'failed'; cause: unknown }

/**
 * Decide o contexto de salas, ou RELANÇA.
 *
 * # O que é engolido, e o que não é
 *
 * Só `schema-not-ready`. Não é falha: é um recurso que ainda não existe, sobre
 * uma tela que funciona há meses sem ele — `20260809_rooms.sql` não foi
 * aplicada.
 *
 * `forbidden`, `unavailable` e `unexpected` sobem. Engoli-los junto
 * transformaria "a RLS recusou" e "o banco não respondeu" em "esta clínica não
 * tem salas": a mesma tela, sem erro em lugar nenhum, e ninguém investigando
 * uma policy quebrada porque nada reclamou.
 *
 * Relançar a causa ORIGINAL — e não uma nova — preserva o `digest` que liga a
 * tela ao log do servidor no error boundary.
 */
export function resolveRoomContext(load: RoomLoad): RoomContext {
  if (load.status === 'loaded') {
    return {
      // `filter` já devolve array novo: a lista de quem chamou não é reordenada
      // nem encurtada por baixo.
      rooms: load.rooms.filter((room) => room.isActive),
      schemaReady: true,
    }
  }

  if (
    isRoomRepositoryError(load.cause) &&
    load.cause.reason === 'schema-not-ready'
  ) {
    return { rooms: [], schemaReady: false }
  }

  throw load.cause
}
