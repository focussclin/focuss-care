'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { cacheTags } from '@/lib/cache/tags'
import { createAppointmentNotification } from '@/lib/notifications/operational'
import { patientPaths } from '@/lib/routes/patientRoutes'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toAppointmentDto } from '../application/toAppointmentDto'
import { toScheduleFailure } from '../application/scheduleFailure'
import { appointmentRepositoryFor } from '../infrastructure/repository'
import {
  createAppointmentSchema,
  scheduleMessages,
  type AppointmentDto,
  type CreateAppointmentInput,
} from '../schemas/appointment.schema'

/** `YYYY-MM-DD` no fuso LOCAL — a tag de agenda é por dia de calendário. */
function civilDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Agendamento real — feature **A-01**.
 *
 * Até aqui a agenda lia do banco e escrevia em `useState`: marcar um
 * atendimento e recarregar a página o fazia desaparecer. Era o R11 do roadmap
 * na sua forma mais cara, porque uma agenda que parece funcionar e não persiste
 * é pior que uma agenda ausente — alguém confia nela.
 *
 * O pipeline do `createAction` faz, antes deste handler ver qualquer coisa:
 * autenticar → resolver a clínica ativa pelo banco → autorizar o papel →
 * validar Zod. Depois do sucesso: invalidar cache, revalidar `/agenda` e
 * auditar.
 *
 * **`clinicId` e `userId` não existem na entrada.** Vêm do `ActionContext`.
 */
const runCreateAppointment = createAction<
  CreateAppointmentInput,
  AppointmentDto,
  'patientId' | 'professionalId' | 'date' | 'time'
>({
  name: 'appointment.create',
  schema: createAppointmentSchema,
  // Derivado da matriz de I-05, não escrito à mão: `finance` não marca consulta.
  roles: rolesWith('appointment.write'),
  messages: {
    forbidden: scheduleMessages.forbidden,
    validation: scheduleMessages.invalidFields,
    unavailable: scheduleMessages.unavailable,
    unexpected: scheduleMessages.unexpected,
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

  afterSuccess: async (output, _input, context) => {
    await createAppointmentNotification({
      client: context.supabase,
      clinicId: context.clinicId,
      userId: context.userId,
      kind: 'created',
      appointment: output,
    })
  },

  handler: async (input, context) => {
    const repository = appointmentRepositoryFor(context.supabase)

    try {
      const appointment = await repository.create(
        context.clinicId,
        {
          patientId: input.patientId,
          professionalId: input.professionalId,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          reason: input.reason,
          status: input.status,
          /*
           * Já normalizado pelo schema: `''` e ausente viraram `null`. O
           * adapter só cita `room_id` no insert quando ele não é nulo, para não
           * quebrar quem ainda não tem a coluna.
           */
          roomId: input.roomId,
          notes: input.notes,
        },
        context.userId,
        {
          allowOutsideBusinessHours: input.confirmOutsideBusinessHours,
        },
      )

      return ok<AppointmentDto>(toAppointmentDto(appointment))
    } catch (cause) {
      return toScheduleFailure('appointment.create', cause, {
        conflict: scheduleMessages.conflict,
        roomConflict: scheduleMessages.roomConflict,
        outsideBusinessHours: scheduleMessages.outsideBusinessHours,
        forbidden: scheduleMessages.forbidden,
        notFound: scheduleMessages.notFound,
        unavailable: scheduleMessages.unavailable,
        unexpected: scheduleMessages.unexpected,
      })
    }
  },

  /**
   * `appointment.created` — o QUE aconteceu, nunca o porquê clínico.
   *
   * `reason` e `internal_notes` ficam DE FORA: os dois são texto livre da
   * recepção e costumam citar a queixa do paciente ("retorno pós-cirúrgico",
   * "suspeita de..."). Isso é dado de saúde. `audit_log` é append-only e legível
   * por toda a operação — o que entra aqui não sai mais. Os valores continuam em
   * `appointments`, alcançáveis por `entity_id`.
   */
  audit: (output, input) => ({
    action: 'appointment.created',
    entityType: 'appointment',
    entityId: output.id,
    after: {
      status: output.status,
      starts_at: output.startsAt,
      duration_minutes: output.durationMinutes,
      /*
       * A exceção fica registrada (A-02).
       *
       * Agendar fora do expediente é permitido e é decisão consciente de quem
       * marcou. Justamente por isso entra no log: se a clínica quiser saber
       * quantos encaixes fora de hora aconteceram no mês, ou por que um
       * profissional atendeu num domingo, a resposta precisa existir. É dado
       * operacional, não clínico.
       */
      outside_business_hours: input.confirmOutsideBusinessHours,
    },
  }),
})

export async function createAppointmentAction(
  rawInput: unknown,
): Promise<
  ActionResult<
    AppointmentDto,
    'patientId' | 'professionalId' | 'date' | 'time'
  >
> {
  return runCreateAppointment(rawInput)
}
