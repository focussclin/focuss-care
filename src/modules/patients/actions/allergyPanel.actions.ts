'use server'

import { recordAllergyAction } from './recordAllergy.action'
import { setAllergyActiveAction } from './setAllergyActive.action'
import { updateAllergyAction } from './updateAllergy.action'
import type { AllergyFormValues } from '../schemas/allergy.schema'

export async function submitAllergyFromPanel(
  patientId: string,
  values: AllergyFormValues,
  allergyId: string | null,
): Promise<string | null> {
  const result = allergyId
    ? await updateAllergyAction({ allergyId, ...values })
    : await recordAllergyAction({ patientId, ...values })
  return result.ok ? null : result.error.message
}

export async function setAllergyActiveFromPanel(
  allergyId: string,
  isActive: boolean,
): Promise<string | null> {
  const result = await setAllergyActiveAction({ allergyId, isActive })
  return result.ok ? null : result.error.message
}
