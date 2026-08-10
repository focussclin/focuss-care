import { ROOM_KIND_ORDER, type Room, type RoomKind } from '../domain/Room'
import type { RoomDto, RoomGroupDto } from '../schemas/room.schema'

export function toRoomDto(room: Room): RoomDto {
  return {
    id: room.id,
    name: room.name,
    kind: room.kind,
    capacity: room.capacity,
    notes: room.notes,
    isActive: room.isActive,
  }
}

/**
 * Agrupa por tipo e ordena — no SERVIDOR.
 *
 * # Onde isto estava antes
 *
 * Dentro de `RoomsScreen`, num `useMemo` sobre a lista crua. E o JSDoc de
 * `RoomsScreen.props.ts` dizia, em voz alta, "já agrupadas e ordenadas **pela
 * rota**" — sobre uma rota que só chamava `map(toRoomDto)`.
 *
 * A frase errada não custava render nenhum; custava a próxima pessoa, que leria
 * o contrato e passaria uma lista já ordenada esperando que ela fosse
 * respeitada.
 *
 * # Por que na aplicação, e não no domínio
 *
 * Agrupar é forma de apresentar. O que é decisão de produto — **qual** ordem —
 * mora em `ROOM_KIND_ORDER`, no domínio. É o mesmo recorte de `toTaskGroups`.
 *
 * # Grupo vazio não entra
 *
 * Uma clínica sem equipamento não precisa ver um cabeçalho "Equipamentos" com
 * nada embaixo: seção vazia se lê como coisa quebrada, não como ausência.
 */
export function toRoomGroups(rooms: readonly Room[]): RoomGroupDto[] {
  const grouped = new Map<RoomKind, RoomDto[]>(
    ROOM_KIND_ORDER.map((kind) => [kind, []]),
  )

  for (const room of rooms) {
    grouped.get(room.kind)?.push(toRoomDto(room))
  }

  return ROOM_KIND_ORDER.flatMap((kind) => {
    const items = grouped.get(kind) ?? []
    if (items.length === 0) return []

    /*
     * Ativas primeiro, depois por nome.
     *
     * A ordem alfabética sozinha misturaria a sala em reforma entre as que
     * funcionam, e quem abre esta tela para marcar alguém precisa das
     * disponíveis à vista. `pt-BR` porque "Área" e "Ala" ordenam errado com a
     * comparação padrão.
     */
    items.sort(
      (first, second) =>
        Number(second.isActive) - Number(first.isActive) ||
        first.name.localeCompare(second.name, 'pt-BR'),
    )

    return [{ kind, rooms: items }]
  })
}
