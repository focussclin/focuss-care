export type RoomKind =
  | 'consultorio'
  | 'sala_exame'
  | 'sala_procedimento'
  | 'equipamento'

/** Recurso reservável da clínica. */
export interface Room {
  id: string
  clinicId: string
  name: string
  kind: RoomKind
  capacity: number | null
  notes: string | null
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface NewRoomData {
  name: string
  kind: RoomKind
  capacity: number | null
  notes: string | null
}

export type RoomUpdateData = NewRoomData
