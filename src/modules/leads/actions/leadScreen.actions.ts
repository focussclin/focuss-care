'use server'

import { convertLeadAction } from './convertLead.action'
import { createLeadAction } from './createLead.action'
import { setLeadStageAction } from './setLeadStage.action'
import { updateLeadAction } from './updateLead.action'
import type { LeadFormValues } from '../schemas/lead.schema'

export async function submitLeadFromScreen(
  values: LeadFormValues,
  leadId: string | null,
): Promise<string | null> {
  const result = leadId
    ? await updateLeadAction({ leadId, ...values })
    : await createLeadAction(values)
  return result.ok ? null : result.error.message
}

export async function moveLeadFromScreen(
  leadId: string,
  stage: LeadFormValues['stage'],
): Promise<string | null> {
  const result = await setLeadStageAction({ leadId, stage })
  return result.ok ? null : result.error.message
}

/**
 * Converte, e devolve o caminho da ficha criada — ou a mensagem de erro.
 *
 * Devolve o caminho, e não `null`, porque a tela precisa levar a pessoa até o
 * paciente novo. Um "convertido com sucesso" que não mostra onde o paciente foi
 * parar faria a recepção procurá-lo na lista para confirmar que existe.
 */
export async function convertLeadFromScreen(
  leadId: string,
): Promise<{ ok: true; patientHref: string } | { ok: false; message: string }> {
  const result = await convertLeadAction({ leadId })

  if (!result.ok) return { ok: false, message: result.error.message }

  return { ok: true, patientHref: `/pacientes/${result.data.patientId}` }
}
