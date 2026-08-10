'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toRoomFailure } from '../application/roomFailure'
import { roomRepositoryFor } from '../infrastructure/repository'
import {
  archiveRoomSchema,
  roomMessages,
  type ArchiveRoomInput,
} from '../schemas/room.schema'

const messages = {
  forbidden: roomMessages.forbidden,
  validation: roomMessages.invalidFields,
  unavailable: roomMessages.unavailable,
  unexpected: roomMessages.unexpected,
}

/**
 * Remove a sala do cadastro — feature **Salas e recursos**.
 *
 * # Remover não é apagar
 *
 * A linha continua no banco, com `deleted_at` preenchido, porque
 * `appointments.room_id` a referencia: apagar de verdade quebraria o histórico
 * de quem foi atendido onde. A migration não cria policy de DELETE justamente
 * por isso.
 *
 * # Por que existe, se já havia "desativar"
 *
 * As duas parecem a mesma coisa e não são. Desativar é "não use agora" —
 * reforma, manutenção — e a sala continua ocupando o nome, porque o índice
 * único é `(clinic_id, lower(name)) where deleted_at is null`.
 *
 * Antes desta fatia **nada no produto escrevia `deleted_at`**. A coluna existia
 * na migration, o adapter a respeitava na leitura, e nenhum caminho a
 * preenchia: uma sala criada por engano ficava para sempre, e o nome dela
 * também.
 *
 * # `/agenda` também é revalidada
 *
 * A agenda ainda não deixa escolher sala (ver o runbook, §"`room_id` espera uma
 * fatia"), mas ela já lê a lista para o dia em que deixar — e o custo de
 * revalidar uma rota a mais numa operação rara é menor que o de descobrir a
 * divergência depois.
 */
const runArchiveRoom = createAction<ArchiveRoomInput, { roomId: string }, 'roomId'>({
  name: 'room.archive',
  schema: archiveRoomSchema,
  roles: rolesWith('clinic.settings'),
  messages,
  revalidatePaths: ['/salas-e-recursos', '/agenda'],
  handler: async (input, context) => {
    try {
      await roomRepositoryFor(context.supabase).archive(
        context.clinicId,
        input.roomId,
      )

      return ok({ roomId: input.roomId })
    } catch (cause) {
      return toRoomFailure<'roomId'>('room.archive', cause)
    }
  },
  audit: (output) => ({
    action: 'room.archived',
    entityType: 'room',
    entityId: output.roomId,
    after: { deleted: true },
  }),
})

export async function archiveRoomAction(
  rawInput: unknown,
): Promise<ActionResult<{ roomId: string }, 'roomId'>> {
  return runArchiveRoom(rawInput)
}
