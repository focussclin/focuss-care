import type { Appointment } from '@/modules/_shared/domain/types'

import type { AppointmentDto } from '../schemas/appointment.schema'

/**
 * Entidade do domínio -> o que atravessa a fronteira da Server Action.
 *
 * A conversão existe porque `Appointment` tem `Date`, e o que uma Server Action
 * devolve é serializado antes de chegar ao navegador. Data vira string ISO.
 *
 * Um lugar só para os três casos de uso — criar, remarcar e cancelar devolvem
 * exatamente a mesma forma, e é isso que deixa o container tratar os três com o
 * mesmo código.
 */
export function toAppointmentDto(appointment: Appointment): AppointmentDto {
  return {
    id: appointment.id,
    patientId: appointment.patientId,
    patientName: appointment.patientName,
    professionalId: appointment.professionalId,
    professionalName: appointment.professionalName,
    type: appointment.type,
    startsAt: appointment.startsAt.toISOString(),
    durationMinutes: appointment.durationMinutes,
    status: appointment.status,
    notes: appointment.notes,
  }
}
