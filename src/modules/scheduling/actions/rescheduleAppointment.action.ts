'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { cacheTags } from '@/lib/cache/tags'
import { createAppointmentNotification } from '@/lib/notifications/operational'
import { patientPaths } from '@/lib/routes/patientRoutes'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toScheduleFailure } from '../application/scheduleFailure'
import { toAppointmentDto } from '../application/toAppointmentDto'
import { appointmentRepositoryFor } from '../infrastructure/repository'
import {
  rescheduleAppointmentSchema,
  scheduleMessages,
  type AppointmentDto,
  type RescheduleAppointmentInput,
} from '../schemas/appointment.schema'

function civilDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Remarcação — feature **A-01**.
 *
 * Remarcar **não** é cancelar e criar de novo. Se fosse, o atendimento perderia
 * a confirmação que o paciente já tinha dado, ganharia um id novo e sumiria de
 * qualquer coisa que apontasse para o antigo. A linha é a mesma; muda o horário.
 *
 * Pelo mesmo motivo o adapter não toca em `status`: confirmado que muda de hora
 * continua confirmado.
 */
const runRescheduleAppointment = createAction<
  RescheduleAppointmentInput,
  AppointmentDto,
  'date' | 'time'
>({
  name: 'appointment.reschedule',
  schema: rescheduleAppointmentSchema,
  roles: rolesWith('appointment.write'),
  messages: {
    forbidden: scheduleMessages.forbidden,
    validation: scheduleMessages.invalidFields,
    unavailable: scheduleMessages.unavailable,
    unexpected: scheduleMessages.unexpected,
  },
  /*
   * Duas tags: o dia de DESTINO sai do `output`, e o de ORIGEM não é conhecido
   * aqui — o repositório devolve a linha já movida. Remarcar entre dias deixaria
   * o dia de origem com uma entrada a mais no cache.
   *
   * Hoje isso é inofensivo (nenhuma leitura usa `use cache`), mas é dívida real
   * assim que a agenda for cacheada: a correção é o repositório devolver também
   * o horário anterior. Registrado aqui em vez de descoberto depois.
   */
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

  afterSuccess: async (output, _input, context) => {
    await createAppointmentNotification({
      client: context.supabase,
      clinicId: context.clinicId,
      userId: context.userId,
      kind: 'rescheduled',
      appointment: output,
    })
  },

  handler: async (input, context) => {
    const repository = appointmentRepositoryFor(context.supabase)

    try {
      const appointment = await repository.reschedule(
        context.clinicId,
        input.appointmentId,
        input.startsAt,
        input.endsAt,
        { allowOutsideBusinessHours: input.confirmOutsideBusinessHours },
      )

      return ok<AppointmentDto>(toAppointmentDto(appointment))
    } catch (cause) {
      return toScheduleFailure('appointment.reschedule', cause, {
        conflict: scheduleMessages.conflict,
        outsideBusinessHours: scheduleMessages.outsideBusinessHours,
        forbidden: scheduleMessages.forbidden,
        notFound: scheduleMessages.notFound,
        unavailable: scheduleMessages.unavailable,
        unexpected: scheduleMessages.unexpected,
      })
    }
  },

  audit: (output, input) => ({
    action: 'appointment.rescheduled',
    entityType: 'appointment',
    entityId: output.id,
    after: {
      starts_at: output.startsAt,
      duration_minutes: output.durationMinutes,
      /** Ver `createAppointment.action.ts`: a exceção fica registrada (A-02). */
      outside_business_hours: input.confirmOutsideBusinessHours,
    },
  }),
})

export async function rescheduleAppointmentAction(
  rawInput: unknown,
): Promise<ActionResult<AppointmentDto, 'date' | 'time'>> {
  return runRescheduleAppointment(rawInput)
}
