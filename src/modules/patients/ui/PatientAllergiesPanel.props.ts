import type { AllergyDto, AllergyFormValues } from '../schemas/allergy.schema'

export interface PatientAllergiesPanelProps {
  patientId: string
  allergies: readonly AllergyDto[]
  onSubmit: (
    patientId: string,
    values: AllergyFormValues,
    allergyId: string | null,
  ) => Promise<string | null>
  onSetActive: (allergyId: string, isActive: boolean) => Promise<string | null>
  /** `record.write` numa clínica conectada. */
  canManage: boolean
  isLive: boolean
  /** Falha de leitura: o painel diz o que houve em vez de fingir "sem alergias". */
  loadError?: string | null
}
