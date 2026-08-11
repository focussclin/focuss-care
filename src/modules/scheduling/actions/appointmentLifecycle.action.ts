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
  confirmAppointmentSchema,
  recordAppointmentOutcomeSchema,
  scheduleMessages,
  type AppointmentDto,
  type ConfirmAppointmentInput,
  type RecordAppointmentOutcomeInput,
} from '../schemas/appointment.schema'

/**
 * Confirmação e desfecho — feature **A-03**.
 *
 * O módulo sabia escrever UM status depois da criação: `canceled`. Um
 * atendimento marcado seguia marcado para sempre, mesmo depois de acontecer — e
 * a taxa de comparecimento de `/indicadores` e `/relatorios`, que lê
 * `completed` e `no_show` de `appointments.status`, ficava nula para sempre.
 */

function civilDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * As mensagens de recusa, iguais para as duas actions.
 *
 * `conflict`, `roomConflict`, `outsideBusinessHours` e `blockedWindow` não
 * ocorrem aqui — mudar status não disputa horário nem sala. Existem porque o
 * tradutor é um só para o módulo inteiro.
 */
function failureMessages(unexpected: string) {
  return {
    conflict: scheduleMessages.conflict,
    roomConflict: scheduleMessages.roomConflict,
    outsideBusinessHours: scheduleMessages.outsideBusinessHours,
    blockedWindow: scheduleMessages.blockedWindow,
    staleStatus: scheduleMessages.staleStatus,
    outcomeTooEarly: scheduleMessages.outcomeTooEarly,
    forbidden: scheduleMessages.forbidden,
    notFound: scheduleMessages.notFound,
    unavailable: scheduleMessages.unavailable,
    unexpected,
  }
}

/*
 * Os caminhos ficam ESCRITOS em cada action, e não numa função compartilhada.
 *
 * `revalidateTargets.test.ts` varre o código-fonte procurando o literal
 * `revalidatePaths: [...]`. Uma função auxiliar chamada no lugar do array —
 * `revalidatePaths: (_, o) => lifecyclePaths(o.patientId)` — é invisível para
 * essa varredura: os caminhos deixam de ser conferidos contra `src/app` e
 * contra o mapa de rotas por módulo, e ninguém nota até a tela não atualizar.
 * Repetir cinco linhas é o preço de continuar auditável.
 */

/**
 * Confirmar exige `appointment.write`: é operar a agenda.
 *
 * A recepção liga na véspera e marca quem confirmou — mesmo ato de quem marca o
 * horário, sobre o mesmo atendimento, sem encerrar nada.
 *
 * **Hoje `appointment.write` e `appointment.cancel` resolvem para os mesmos
 * quatro papéis** (só `finance` fica de fora dos dois). A escolha não muda quem
 * passa agora — muda o que acontece quando a matriz de I-05 for ajustada, e é
 * por isso que a permissão pedida é a que descreve a decisão, e não a que dá o
 * resultado conveniente. É a mesma razão registrada em
 * `cancelAppointment.action.ts`: "cancelar não é a mesma decisão que marcar,
 * mesmo que hoje os papéis coincidam".
 */
const runConfirm = createAction<ConfirmAppointmentInput, AppointmentDto, 'appointmentId'>({
  name: 'appointment.confirm',
  schema: confirmAppointmentSchema,
  roles: rolesWith('appointment.write'),
  messages: {
    forbidden: scheduleMessages.forbidden,
    validation: scheduleMessages.invalidFields,
    unavailable: scheduleMessages.unavailable,
    unexpected: scheduleMessages.unexpectedConfirm,
  },
  cacheTags: ({ clinicId }, output) => [
    cacheTags.agenda(clinicId, civilDay(new Date(output.startsAt))),
  ],
  /*
   * `/indicadores` entra por causa do desfecho: a taxa de comparecimento e a
   * serie mensal sao contadas de `appointments.status`, e sem revalidar a tela
   * mostraria o numero anterior a falta que acabou de ser registrada.
   */
  revalidatePaths: (_scope, output) => [
    '/agenda',
    '/dashboard',
    '/relatorios',
    '/indicadores',
    ...patientPaths(output.patientId),
  ],

  handler: async (input, context) => {
    try {
      const appointment = await appointmentRepositoryFor(context.supabase).confirm(
        context.clinicId,
        input.appointmentId,
        context.userId,
      )
      return ok<AppointmentDto>(toAppointmentDto(appointment))
    } catch (cause) {
      return toScheduleFailure<'appointmentId'>(
        'appointment.confirm',
        cause,
        failureMessages(scheduleMessages.unexpectedConfirm),
      )
    }
  },

  audit: (output) => ({
    action: 'appointment.confirmed',
    entityType: 'appointment',
    entityId: output.id,
    after: { status: output.status },
  }),
})

/**
 * Registrar o desfecho exige `appointment.cancel`, e não `appointment.write`.
 *
 * `no_show` devolve o horário à agenda e entra na taxa de comparecimento da
 * clínica; `completed` afirma que o atendimento aconteceu. As duas ENCERRAM o
 * atendimento — mesma classe de decisão do cancelamento, e não a de marcar mais
 * um horário. Ver o bloco de `runConfirm` sobre por que a distinção importa
 * mesmo com os papéis coincidindo hoje.
 */
const runRecordOutcome = createAction<
  RecordAppointmentOutcomeInput,
  AppointmentDto,
  'appointmentId' | 'outcome'
>({
  name: 'appointment.record_outcome',
  schema: recordAppointmentOutcomeSchema,
  roles: rolesWith('appointment.cancel'),
  messages: {
    forbidden: scheduleMessages.forbidden,
    validation: scheduleMessages.invalidFields,
    unavailable: scheduleMessages.unavailable,
    unexpected: scheduleMessages.unexpectedOutcome,
  },
  cacheTags: ({ clinicId }, output) => [
    cacheTags.agenda(clinicId, civilDay(new Date(output.startsAt))),
  ],
  /*
   * `/indicadores` entra por causa do desfecho: a taxa de comparecimento e a
   * serie mensal sao contadas de `appointments.status`, e sem revalidar a tela
   * mostraria o numero anterior a falta que acabou de ser registrada.
   */
  revalidatePaths: (_scope, output) => [
    '/agenda',
    '/dashboard',
    '/relatorios',
    '/indicadores',
    ...patientPaths(output.patientId),
  ],

  handler: async (input, context) => {
    try {
      const appointment = await appointmentRepositoryFor(
        context.supabase,
      ).recordOutcome(
        context.clinicId,
        input.appointmentId,
        input.outcome,
        context.userId,
      )
      return ok<AppointmentDto>(toAppointmentDto(appointment))
    } catch (cause) {
      return toScheduleFailure<'appointmentId' | 'outcome'>(
        'appointment.record_outcome',
        cause,
        failureMessages(scheduleMessages.unexpectedOutcome),
      )
    }
  },

  /**
   * Dois eventos distintos, e não um `appointment.outcome_recorded` com o valor
   * no corpo: quem audita procura a falta, e procurar por ação é o que a tela de
   * auditoria oferece.
   */
  audit: (output) => ({
    action:
      output.status === 'no_show'
        ? 'appointment.no_show'
        : 'appointment.completed',
    entityType: 'appointment',
    entityId: output.id,
    after: { status: output.status },
  }),
})

export async function confirmAppointmentAction(
  rawInput: unknown,
): Promise<ActionResult<AppointmentDto, 'appointmentId'>> {
  return runConfirm(rawInput)
}

export async function recordAppointmentOutcomeAction(
  rawInput: unknown,
): Promise<ActionResult<AppointmentDto, 'appointmentId' | 'outcome'>> {
  return runRecordOutcome(rawInput)
}
