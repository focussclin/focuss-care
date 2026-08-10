export type RoomKind =
  | 'consultorio'
  | 'sala_exame'
  | 'sala_procedimento'
  | 'equipamento'

/**
 * A ordem em que os tipos aparecem — decisão de produto, não de tela.
 *
 * Consultório primeiro porque é o que a clínica configura primeiro e o que ela
 * tem em maior número; equipamento por último porque é o único que não é um
 * lugar, e misturá-lo no meio das salas faz a lista parecer desorganizada.
 *
 * Mora no domínio, e não no componente, porque é a mesma ordem em qualquer
 * lugar que liste recursos — e porque uma ordem escrita dentro do JSX não tem
 * como ser verificada sem renderizar a tela inteira.
 */
export const ROOM_KIND_ORDER: readonly RoomKind[] = [
  'consultorio',
  'sala_exame',
  'sala_procedimento',
  'equipamento',
]

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
