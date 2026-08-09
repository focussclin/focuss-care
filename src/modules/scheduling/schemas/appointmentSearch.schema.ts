import { z } from 'zod'

export const APPOINTMENT_SEARCH_LIMIT = 8
export const APPOINTMENT_SEARCH_MIN_LENGTH = 2

export const appointmentSearchMessages = {
  queryTooShort: 'Digite pelo menos dois caracteres para buscar.',
  forbidden: 'Você não tem permissão para consultar a agenda.',
  unavailable: 'Não foi possível buscar atendimentos agora.',
} as const

export const searchAppointmentsSchema = z.object({
  query: z
    .string()
    .trim()
    .min(APPOINTMENT_SEARCH_MIN_LENGTH, appointmentSearchMessages.queryTooShort)
    .max(80, appointmentSearchMessages.unavailable),
})

export type SearchAppointmentsInput = z.infer<typeof searchAppointmentsSchema>

export interface AppointmentSearchDto {
  id: string
  patientName: string
  professionalName: string
  type: string
  startsAt: string
  status: string
}
