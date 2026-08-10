export const PATIENT_TAG_COLORS = [
  'blue',
  'violet',
  'green',
  'amber',
  'rose',
  'slate',
] as const

export type PatientTagColor = (typeof PATIENT_TAG_COLORS)[number]

export interface PatientTag {
  id: string
  name: string
  color: PatientTagColor
}

export interface AddPatientTagData {
  patientId: string
  name: string
  color: PatientTagColor
}
