import { z } from 'zod'

export const appointmentMessages = {
  patientRequired: 'Selecione um paciente.',
  professionalRequired: 'Selecione um profissional.',
  typeRequired: 'Informe o tipo de atendimento.',
  dateRequired: 'Escolha uma data.',
  timeRequired: 'Escolha um horário.',
  conflict: 'Este profissional já possui um atendimento nesse horário.',
} as const

/** Valores do enum `appointment_status` do banco que fazem sentido na criacao. */
export const appointmentStatusOptions = [
  { value: 'scheduled', label: 'Aguardando confirmação' },
  { value: 'confirmed', label: 'Confirmado' },
] as const

export const durationOptions = [
  { value: '30', label: '30 minutos' },
  { value: '45', label: '45 minutos' },
  { value: '60', label: '1 hora' },
  { value: '90', label: '1h 30min' },
] as const

export const newAppointmentSchema = z.object({
  patientId: z.string().min(1, appointmentMessages.patientRequired),
  professionalId: z.string().min(1, appointmentMessages.professionalRequired),
  type: z.string().trim().min(1, appointmentMessages.typeRequired),
  date: z.string().min(1, appointmentMessages.dateRequired),
  time: z.string().min(1, appointmentMessages.timeRequired),
  durationMinutes: z.string(),
  status: z.enum(['scheduled', 'confirmed']),
  notes: z.string().optional(),
})

export type NewAppointmentInput = z.infer<typeof newAppointmentSchema>
