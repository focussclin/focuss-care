import type { Encounter, QueueEntry } from '../domain/Encounter'
import type {
  EncounterDto,
  QueueEntryDto,
} from '../schemas/encounter.schema'

/**
 * Entidade -> o que atravessa a fronteira da Server Action.
 *
 * A conversão existe porque as entidades têm `Date`, e o retorno de uma Server
 * Action é serializado antes de chegar ao navegador.
 *
 * **`reason` fica de fora do DTO da fila**, e é omissão deliberada: é texto
 * livre da recepção e costuma descrever a queixa do paciente. Quem precisa dela
 * abre o prontuário, que tem auditoria de leitura própria (R-01).
 */
export function toQueueEntryDto(entry: QueueEntry): QueueEntryDto {
  return {
    id: entry.id,
    patientId: entry.patientId,
    patientName: entry.patientName,
    appointmentId: entry.appointmentId,
    professionalId: entry.professionalId,
    professionalName: entry.professionalName,
    priority: entry.priority,
    status: entry.status,
    arrivedAt: entry.arrivedAt.toISOString(),
    calledAt: entry.calledAt?.toISOString() ?? null,
    startedAt: entry.startedAt?.toISOString() ?? null,
  }
}

export function toEncounterDto(encounter: Encounter): EncounterDto {
  return {
    id: encounter.id,
    patientId: encounter.patientId,
    patientName: encounter.patientName,
    professionalId: encounter.professionalId,
    professionalName: encounter.professionalName,
    appointmentId: encounter.appointmentId,
    status: encounter.status,
    startsAt: encounter.startedAt.toISOString(),
    endedAt: encounter.endedAt?.toISOString() ?? null,
  }
}
