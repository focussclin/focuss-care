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

/**
 * Entidade -> o que atravessa a fronteira da Server Action.
 *
 * `canSeeClinical` decide se a QUEIXA PRINCIPAL viaja. É o mesmo desenho de
 * `toServiceDto(service, canSeePrice)`: o que um papel não pode ver **não
 * atravessa**, em vez de ser escondido na tela. `/atendimentos` é operada pela
 * recepção, e a queixa é conteúdo clínico.
 */
export function toEncounterDto(
  encounter: Encounter,
  canSeeClinical: boolean,
): EncounterDto {
  return {
    id: encounter.id,
    patientId: encounter.patientId,
    patientName: encounter.patientName,
    professionalId: encounter.professionalId,
    professionalName: encounter.professionalName,
    appointmentId: encounter.appointmentId,
    status: encounter.status,
    ...(canSeeClinical ? { chiefComplaint: encounter.chiefComplaint } : {}),
    startsAt: encounter.startedAt.toISOString(),
    endedAt: encounter.endedAt?.toISOString() ?? null,
  }
}
