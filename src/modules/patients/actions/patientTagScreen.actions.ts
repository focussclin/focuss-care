'use server'

import { addPatientTagAction } from './addPatientTag.action'
import { removePatientTagAction } from './removePatientTag.action'
import type { PatientTagColor } from '../domain/PatientTag'

export async function addPatientTagFromScreen(
  patientId: string,
  name: string,
  color: PatientTagColor,
): Promise<string | null> {
  const result = await addPatientTagAction({ patientId, name, color })
  return result.ok ? null : result.error.message
}

export async function removePatientTagFromScreen(
  patientId: string,
  tagId: string,
): Promise<string | null> {
  const result = await removePatientTagAction({ patientId, tagId })
  return result.ok ? null : result.error.message
}
