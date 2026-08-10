'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { err, ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { appointmentRepositoryFor } from '../infrastructure/repository'
import {
  APPOINTMENT_SEARCH_LIMIT,
  appointmentSearchMessages,
  searchAppointmentsSchema,
  type AppointmentSearchDto,
  type SearchAppointmentsInput,
} from '../schemas/appointmentSearch.schema'

type Field = 'query'

const runSearchAppointments = createAction<
  SearchAppointmentsInput,
  readonly AppointmentSearchDto[],
  Field
>({
  name: 'appointment.search',
  schema: searchAppointmentsSchema,
  roles: rolesWith('appointment.read'),
  messages: {
    forbidden: appointmentSearchMessages.forbidden,
    validation: appointmentSearchMessages.queryTooShort,
    unavailable: appointmentSearchMessages.unavailable,
    unexpected: appointmentSearchMessages.unavailable,
  },

  handler: async (input, context) => {
    try {
      const appointments = await appointmentRepositoryFor(
        context.supabase,
      ).searchByPatientName(
        context.clinicId,
        input.query,
        APPOINTMENT_SEARCH_LIMIT,
      )

      return ok<readonly AppointmentSearchDto[]>(
        appointments.map((appointment) => ({
          id: appointment.id,
          patientName: appointment.patientName,
          professionalName: appointment.professionalName,
          type: appointment.type,
          startsAt: appointment.startsAt.toISOString(),
          status: appointment.status,
        })),
      )
    } catch (cause) {
      console.error('[appointment.search] leitura recusada', {
        kind: cause instanceof Error ? cause.name : typeof cause,
      })
      return err<Field>('unavailable', appointmentSearchMessages.unavailable)
    }
  },
})

export async function searchAppointmentsAction(
  rawInput: unknown,
): Promise<ActionResult<readonly AppointmentSearchDto[], Field>> {
  return runSearchAppointments(rawInput)
}
