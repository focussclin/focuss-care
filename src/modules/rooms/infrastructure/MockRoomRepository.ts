import type { NewRoomData, Room, RoomUpdateData } from '../domain/Room'
import type { RoomRepository } from '../domain/RoomRepository'
import { RoomRepositoryError } from '../domain/RoomRepositoryError'

const DEMO_CLINIC_ID = 'demo-clinic'

const initialRooms: Room[] = [
  room('1', 'Consultório 1', 'consultorio', 3),
  room('2', 'Consultório 2', 'consultorio', 3),
  room('3', 'Sala de exames', 'sala_exame', 2),
  room('4', 'Ultrassom portátil', 'equipamento', null),
]

/** Repositório isolado do modo demo; nenhuma escrita representa banco real. */
export class MockRoomRepository implements RoomRepository {
  private readonly rooms = initialRooms.map((item) => ({ ...item }))

  async list(clinicId: string): Promise<Room[]> {
    return this.rooms
      .filter((item) => item.clinicId === clinicId)
      .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
  }

  async create(clinicId: string, data: NewRoomData): Promise<Room> {
    const created = room(String(this.rooms.length + 1), data.name, data.kind, data.capacity)
    created.clinicId = clinicId
    created.notes = data.notes
    this.rooms.push(created)
    return created
  }

  async update(_clinicId: string, roomId: string, data: RoomUpdateData): Promise<Room> {
    void _clinicId
    const current = this.rooms.find((item) => item.id === roomId)
    if (!current) throw new RoomRepositoryError('not-found', 'recurso não encontrado')
    Object.assign(current, { ...data, notes: data.notes || null, updatedAt: new Date() })
    return current
  }

  async setActive(_clinicId: string, roomId: string, isActive: boolean): Promise<Room> {
    void _clinicId
    const current = this.rooms.find((item) => item.id === roomId)
    if (!current) throw new RoomRepositoryError('not-found', 'recurso não encontrado')
    current.isActive = isActive
    current.updatedAt = new Date()
    return current
  }
}

function room(
  id: string,
  name: string,
  kind: Room['kind'],
  capacity: number | null,
): Room {
  const now = new Date('2026-08-09T12:00:00.000Z')
  return {
    id,
    clinicId: DEMO_CLINIC_ID,
    name,
    kind,
    capacity,
    notes: null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  }
}
