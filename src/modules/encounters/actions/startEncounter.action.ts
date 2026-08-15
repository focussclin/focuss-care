'use server'

import { can, rolesWith } from '@/lib/auth/permissions'
import { observePaymentGate } from '@/lib/clinic/payment-gate'
import { createEncounterNotification } from '@/lib/notifications/operational'
import { syncAppointmentProgress } from '@/lib/scheduling/appointment-progress'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toEncounterFailure } from '../application/encounterFailure'
import { toEncounterDto } from '../application/toEncounterDto'
import { encounterRepositoryFor } from '../infrastructure/repository'
import {
  encounterMessages,
  startEncounterSchema,
  type EncounterDto,
  type StartEncounterInput,
} from '../schemas/encounter.schema'

/**
 * Iniciar o atendimento (**E-01**).
 *
 * Duas coisas acontecem no mesmo instante, por ângulos diferentes: a fila entra
 * em `in_service` (ponto de vista da recepção) e **nasce o `encounter`** (ponto
 * de vista do prontuário). É esse registro que R-01 vai versionar e que o
 * faturamento vai cobrar.
 *
 * O `professionalId` vem do cliente, e é legítimo: diz QUEM vai atender, não de
 * qual clínica ler. A RLS e o filtro por `clinic_id` garantem que um
 * profissional de outra clínica não seja aceito.
 */
const runStartEncounter = createAction<
  StartEncounterInput,
  EncounterDto,
  'professionalId'
>({
  name: 'encounter.start',
  schema: startEncounterSchema,
  roles: rolesWith('encounter.write'),
  messages: {
    forbidden: encounterMessages.forbidden,
    validation: encounterMessages.invalidFields,
    unavailable: encounterMessages.unavailable,
    unexpected: encounterMessages.unexpected,
  },
  /* `/agenda` entra pelo carimbo de `in_progress`. Ver `checkIn.action.ts`. */
  revalidatePaths: ['/atendimentos', '/dashboard', '/agenda'],

  afterSuccess: async (output, _input, context) => {
    await createEncounterNotification({
      client: context.supabase,
      clinicId: context.clinicId,
      userId: context.userId,
      kind: 'started',
      patientName: output.patientName,
      eventAt: output.startsAt,
    })

    /*
     * `in_progress` aceita partir de `scheduled` — ver `IN_PROGRESS_FROM`.
     *
     * Quando o atendimento comeca, a pessoa esta na sala, e isso e fato
     * observado. Exigir a passagem por `checked_in` deixaria a agenda presa em
     * "Agendado" sempre que a chegada nao tivesse sido carimbada — inclusive nos
     * atendimentos anteriores a esta fatia, que sao a base inteira.
     */
    await syncAppointmentProgress({
      client: context.supabase,
      clinicId: context.clinicId,
      appointmentId: output.appointmentId,
      progress: 'in_progress',
      userId: context.userId,
    })

    /*
     * Portão de pagamento em MODO OBSERVAÇÃO — etapa 3. Ver `callPatient`.
     *
     * `start` é observado além de `call` porque nem todo atendimento passa por
     * "chamar": `IN_PROGRESS_FROM` aceita começar direto. Medir só a chamada
     * subestimaria quantas entradas a regra pegaria.
     */
    await observePaymentGate({
      client: context.supabase,
      clinicId: context.clinicId,
      appointmentId: output.appointmentId,
      step: 'start',
    })
  },

  handler: async (input, context) => {
    const repository = encounterRepositoryFor(context.supabase)

    try {
      const encounter = await repository.start(
        context.clinicId,
        input.queueEntryId,
        input.professionalId,
        context.userId,
      )

      return ok<EncounterDto>(toEncounterDto(encounter, can(context.role, 'record.read')))
    } catch (cause) {
      return toEncounterFailure<'professionalId'>('encounter.start', cause)
    }
  },

  audit: (output) => ({
    action: 'encounter.started',
    entityType: 'encounter',
    entityId: output.id,
    after: { professional_id: output.professionalId },
  }),
})

export async function startEncounterAction(
  rawInput: unknown,
): Promise<ActionResult<EncounterDto, 'professionalId'>> {
  return runStartEncounter(rawInput)
}
