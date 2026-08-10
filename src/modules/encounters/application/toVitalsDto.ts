import type { VitalsEntry } from '../domain/Vitals'
import type { VitalsEntryDto } from '../schemas/vitals.schema'

/**
 * `recordedBy` não cruza a fronteira.
 *
 * A tela não mostra quem aferiu, e mandar o id do profissional para o cliente
 * exporia um dado que nada na interface usa. Ele existe no banco para a trilha
 * clínica, que é leitura de servidor.
 */
export function toVitalsDto(entry: VitalsEntry): VitalsEntryDto {
  return {
    id: entry.id,
    patientId: entry.patientId,
    encounterId: entry.encounterId,
    measuredAt: entry.measuredAt.toISOString(),
    weightKg: entry.weightKg,
    heightCm: entry.heightCm,
    systolicBp: entry.systolicBp,
    diastolicBp: entry.diastolicBp,
    heartRate: entry.heartRate,
    respiratoryRate: entry.respiratoryRate,
    temperatureC: entry.temperatureC,
    spo2: entry.spo2,
    glucoseMgdl: entry.glucoseMgdl,
    notes: entry.notes,
  }
}
