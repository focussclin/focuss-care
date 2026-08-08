'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { cacheTags } from '@/lib/cache/tags'
import { patientPaths } from '@/lib/routes/patientRoutes'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toScheduleFailure } from '../application/scheduleFailure'
import { toAppointmentDto } from '../application/toAppointmentDto'
import { appointmentRepositoryFor } from '../infrastructure/repository'
import {
  cancelAppointmentSchema,
  scheduleMessages,
  type AppointmentDto,
  type CancelAppointmentInput,
} from '../schemas/appointment.schema'

function civilDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Cancelamento — feature **A-01**.
 *
 * Cancelar **não apaga**. A linha continua na base com `status = 'canceled'`,
 * `canceled_at` e o motivo, e o histórico ganha uma entrada em
 * `appointment_status_history`. Agenda de saúde é registro do que foi combinado,
 * inclusive do que foi desmarcado — quem desmarcou e quando é informação que a
 * clínica precisa ter, não apagar.
 */
const runCancelAppointment = createAction<
  CancelAppointmentInput,
  AppointmentDto,
  'reason'
>({
  name: 'appointment.cancel',
  schema: cancelAppointmentSchema,
  // Permissão própria na matriz de I-05: cancelar não é a mesma decisão que
  // marcar, mesmo que hoje os papéis coincidam.
  roles: rolesWith('appointment.cancel'),
  messages: {
    forbidden: scheduleMessages.forbidden,
    validation: scheduleMessages.invalidFields,
    unavailable: scheduleMessages.unavailable,
    unexpected: scheduleMessages.unexpectedCancel,
  },
  cacheTags: ({ clinicId }, output) => [
    cacheTags.agenda(clinicId, civilDay(new Date(output.startsAt))),
  ],
  // O relatorio conta atendimentos por desfecho no periodo — criar, remarcar
  // e cancelar mudam esses numeros.
  /*
   * A ficha e o historico do paciente listam os atendimentos dele — mudar a
   * agenda muda as duas telas. O caminho sai de `output.patientId`, que veio do
   * repositorio depois da RLS.
   */
  revalidatePaths: (_scope, output) => [
    '/agenda',
    '/dashboard',
    '/relatorios',
    ...patientPaths(output.patientId),
  ],

  handler: async (input, context) => {
    const repository = appointmentRepositoryFor(context.supabase)

    try {
      const appointment = await repository.cancel(
        context.clinicId,
        input.appointmentId,
        input.reason,
        context.userId,
      )

      return ok<AppointmentDto>(toAppointmentDto(appointment))
    } catch (cause) {
      return toScheduleFailure('appointment.cancel', cause, {
        conflict: scheduleMessages.conflict,
        // Cancelar nunca cai neste caso — não há horário novo a verificar. A
        // mensagem existe porque o tradutor é um só para as três actions.
        outsideBusinessHours: scheduleMessages.outsideBusinessHours,
        forbidden: scheduleMessages.forbidden,
        notFound: scheduleMessages.notFound,
        unavailable: scheduleMessages.unavailable,
        unexpected: scheduleMessages.unexpectedCancel,
      })
    }
  },

  /**
   * O motivo do cancelamento NÃO entra no evento.
   *
   * É texto livre e, numa clínica, costuma explicar a razão clínica ("paciente
   * internado", "exame alterado"). Isso é dado de saúde, e `audit_log` é
   * append-only e legível por toda a operação. O valor fica em
   * `appointments.cancel_reason`, alcançável por `entity_id`, com a RLS da
   * tabela valendo.
   */
  audit: (output) => ({
    action: 'appointment.canceled',
    entityType: 'appointment',
    entityId: output.id,
    after: { status: output.status },
  }),
})

export async function cancelAppointmentAction(
  rawInput: unknown,
): Promise<ActionResult<AppointmentDto, 'reason'>> {
  return runCancelAppointment(rawInput)
}
