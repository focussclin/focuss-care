import type { NewRoomData, Room, RoomUpdateData } from './Room'

/** Porta de configuração dos recursos da clínica. */
export interface RoomRepository {
  list(clinicId: string): Promise<Room[]>
  create(clinicId: string, data: NewRoomData): Promise<Room>
  update(clinicId: string, roomId: string, data: RoomUpdateData): Promise<Room>
  setActive(clinicId: string, roomId: string, isActive: boolean): Promise<Room>
}
