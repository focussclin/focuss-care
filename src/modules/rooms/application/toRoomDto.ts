import type { Room } from '../domain/Room'
import type { RoomDto } from '../schemas/room.schema'

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
