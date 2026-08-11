'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createEncounterNotification } from '@/lib/notifications/operational'
import { syncAppointmentProgress } from '@/lib/scheduling/appointment-progress'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toEncounterFailure } from '../application/encounterFailure'
import { toQueueEntryDto } from '../application/toEncounterDto'
import { encounterRepositoryFor } from '../infrastructure/repository'
import {
  checkInSchema,
  encounterMessages,
  type CheckInInput,
  type QueueEntryDto,
} from '../schemas/encounter.schema'

/**
 * Check-in — o paciente chegou (**E-01**).
 *
 * É o marco zero de tudo que a tela mede depois: tempo de espera, tempo até ser
 * chamado, duração do atendimento. Por isso `arrived_at` é gravado no servidor,
 * e não enviado pelo cliente — o relógio do navegador da recepção não pode
 * decidir há quanto tempo alguém espera.
 *
 * Aceita chegada **sem agendamento** (`appointmentId` nulo): encaixe é rotina de
 * clínica, e uma fila que só aceita quem tinha hora marcada seria uma fila que
 * não corresponde à sala de espera.
 */
const runCheckIn = createAction<CheckInInput, QueueEntryDto, 'patientId'>({
  name: 'encounter.checkIn',
  schema: checkInSchema,
  roles: rolesWith('encounter.write'),
  messages: {
    forbidden: encounterMessages.forbidden,
    validation: encounterMessages.invalidFields,
    unavailable: encounterMessages.unavailable,
    unexpected: encounterMessages.unexpected,
  },
  /*
   * `/agenda` entra porque o carimbo abaixo muda `appointments.status`.
   *
   * Sem ela, quem faz o check-in e volta para a agenda continua vendo
   * "Agendado" sobre a pessoa que acabou de entrar na sala de espera — que é
   * exatamente a divergência que esta fatia veio fechar.
   */
  revalidatePaths: ['/atendimentos', '/dashboard', '/agenda'],

  afterSuccess: async (output, _input, context) => {
    await createEncounterNotification({
      client: context.supabase,
      clinicId: context.clinicId,
      userId: context.userId,
      kind: 'checked_in',
      patientName: output.patientName,
      eventAt: output.arrivedAt,
    })

    /*
     * A agenda acompanha a fila — feature **A-04**.
     *
     * Depois da resposta e best-effort, pelo mesmo motivo da notificação: o
     * paciente chegou, e a chegada não se desfaz porque a agenda não pôde ser
     * carimbada. Encaixe (`appointmentId` nulo) não tem agenda a mover.
     */
    await syncAppointmentProgress({
      client: context.supabase,
      clinicId: context.clinicId,
      appointmentId: output.appointmentId,
      progress: 'checked_in',
      userId: context.userId,
    })
  },

  handler: async (input, context) => {
    const repository = encounterRepositoryFor(context.supabase)

    try {
      const entry = await repository.checkIn(context.clinicId, {
        patientId: input.patientId,
        appointmentId: input.appointmentId,
        professionalId: input.professionalId,
        priority: input.priority,
        reason: input.reason,
      })

      return ok<QueueEntryDto>(toQueueEntryDto(entry))
    } catch (cause) {
      return toEncounterFailure<'patientId'>('encounter.checkIn', cause)
    }
  },

  /**
   * O motivo declarado na chegada **não** entra no evento.
   *
   * É texto livre e, numa recepção, costuma ser a queixa ("dor no peito").
   * `audit_log` é append-only e legível por toda a operação — o que entra ali
   * não sai mais. O valor fica em `waiting_queue`, com a RLS da tabela valendo.
   */
  audit: (output) => ({
    action: 'encounter.checked_in',
    entityType: 'waiting_queue',
    entityId: output.id,
    after: { priority: output.priority, walk_in: output.appointmentId === null },
  }),
})

export async function checkInAction(
  rawInput: unknown,
): Promise<ActionResult<QueueEntryDto, 'patientId'>> {
  return runCheckIn(rawInput)
}
