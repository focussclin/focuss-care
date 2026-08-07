import { toPhoneDigits } from '@/lib/utils/phone'
import type { Patient } from '@/modules/_shared/domain/types'

import type { NewPatientData } from '../domain/PatientRepository'
import { toIsoDate } from './toPatientDto'

/**
 * QUAIS campos a edicao muda — nunca os valores.
 *
 * Serve so a auditoria: `patient.updated` precisa responder "o telefone foi
 * alterado", nao "o telefone passou de X para Y". Os valores vivem em `patients`,
 * alcancaveis por `entity_id`; repeti-los em `audit_log` — append-only e legivel
 * pela operacao inteira — criaria um historico paralelo de dado pessoal.
 *
 * A comparacao normaliza dos dois lados porque a entidade carrega a forma de
 * EXIBICAO (telefone com mascara, data como `Date`) e a entrada ja esta na forma
 * CANONICA. Sem isso, todo save acusaria mudanca em telefone e nascimento.
 */
export function changedFields(
  current: Patient,
  next: NewPatientData,
): readonly string[] {
  const changed: string[] = []

  if (current.name !== next.fullName) changed.push('name')
  if (toPhoneDigits(current.phone) !== (next.phone ?? '')) changed.push('phone')
  if ((current.email || null) !== next.email) changed.push('email')
  if (toIsoDate(current.birthDate) !== next.birthDate) changed.push('birth_date')
  if ((current.adminNotes ?? null) !== next.adminNotes) changed.push('admin_notes')

  return changed
}
