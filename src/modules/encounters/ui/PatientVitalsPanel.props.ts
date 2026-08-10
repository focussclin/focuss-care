import type { VitalsEntryDto, VitalsFormValues } from '../schemas/vitals.schema'

export interface PatientVitalsPanelProps {
  patientId: string
  entries: readonly VitalsEntryDto[]
  onRecord: (patientId: string, values: VitalsFormValues) => Promise<string | null>
  /** `encounter.write` — a matriz nomeia "sinais vitais" nessa permissão. */
  canRecord: boolean
  isLive: boolean
  /** Falha de leitura: o painel diz o que houve em vez de fingir "sem aferições". */
  loadError?: string | null
}
