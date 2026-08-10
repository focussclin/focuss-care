import type { NewRoomData, Room, RoomUpdateData } from './Room'

/** Porta de configuração dos recursos da clínica. */
export interface RoomRepository {
  list(clinicId: string): Promise<Room[]>
  create(clinicId: string, data: NewRoomData): Promise<Room>
  update(clinicId: string, roomId: string, data: RoomUpdateData): Promise<Room>

  /**
   * Desativa ou reativa — a sala continua existindo.
   *
   * É o estado de "não use agora": reforma, equipamento em manutenção. O
   * histórico e o nome continuam de pé, e reativar é um clique.
   */
  setActive(clinicId: string, roomId: string, isActive: boolean): Promise<Room>

  /**
   * REMOVE a sala do cadastro, por `deleted_at`.
   *
   * # Por que não é `delete`
   *
   * `appointments.room_id` referencia esta linha. Apagar de verdade quebraria o
   * histórico de quem foi atendido onde — e a migration não cria policy de
   * DELETE justamente por isso.
   *
   * # Por que não bastava `setActive(false)`
   *
   * As duas coisas parecem a mesma e não são. Desativada continua ocupando o
   * nome: o índice único é `(clinic_id, lower(name)) where deleted_at is null`.
   * Quem criou "Sala 1" por engano e a desativou não conseguia criar outra
   * "Sala 1" — recebia "já existe uma sala com esse nome" apontando para uma
   * que ele acabara de tirar do ar.
   *
   * Antes desta fatia **nada no produto escrevia `deleted_at`**: a coluna
   * existia, a leitura a respeitava, e nenhum caminho a preenchia. Uma sala
   * criada por engano ficava para sempre.
   */
  archive(clinicId: string, roomId: string): Promise<void>
}
