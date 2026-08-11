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

  // P-01 completa. Mesma regra: QUAIS campos, nunca os valores.
  if ((current.socialName ?? null) !== next.socialName) changed.push('social_name')
  if (toPhoneDigits(current.phoneAlt ?? '') !== (next.phoneAlt ?? '')) {
    changed.push('phone_alt')
  }
  if ((current.biologicalSex ?? 'not_informed') !== next.biologicalSex) {
    changed.push('biological_sex')
  }
  if ((current.genderIdentity ?? null) !== next.genderIdentity) {
    changed.push('gender_identity')
  }
  if (emergencyContactChanged(current, next)) changed.push('emergency_contact')

  /*
   * Grupo documental. O evento diz que o CPF mudou — **nunca qual é**.
   *
   * Identificador fiscal em `audit_log` seria dado pessoal num lugar
   * append-only, legível por `audit.read`, e fora do alcance de qualquer pedido
   * de exclusão que a LGPD permita ao titular.
   */
  if ((current.cpf ?? null) !== next.cpf) changed.push('cpf')
  if ((current.cns ?? null) !== next.cns) changed.push('cns')
  if (addressChanged(current, next)) changed.push('address')

  return changed
}

/**
 * O contato mudou?
 *
 * Comparado campo a campo, e não por `JSON.stringify`: a ordem das chaves de um
 * objeto vindo do `jsonb` não é garantida, e comparar o texto acusaria mudança a
 * cada save só porque o banco devolveu as chaves em outra ordem.
 *
 * Um contato ILEGÍVEL conta como mudança: salvar por cima substitui o que está
 * lá, e é exatamente isso que a auditoria precisa registrar.
 */
function emergencyContactChanged(
  current: Patient,
  next: NewPatientData,
): boolean {
  if (current.emergencyContactUnreadable) return true

  const before = current.emergencyContact ?? null
  const after = next.emergencyContact

  if (before === null || after === null) return before !== after

  return (
    before.name !== after.name ||
    (before.phone ?? null) !== (after.phone ?? null) ||
    (before.relationship ?? null) !== (after.relationship ?? null)
  )
}

/**
 * O endereço mudou?
 *
 * Campo a campo, pelo mesmo motivo do contato: a ordem das chaves de um `jsonb`
 * não é garantida, e comparar texto acusaria mudança a cada save.
 *
 * Endereço ILEGÍVEL conta como mudança — salvar substitui o que está lá.
 */
function addressChanged(current: Patient, next: NewPatientData): boolean {
  if (current.addressUnreadable) return true

  const before = current.address ?? null
  const after = next.address

  if (before === null || after === null) return before !== after

  return (
    (before.zip ?? null) !== (after.zip ?? null) ||
    (before.street ?? null) !== (after.street ?? null) ||
    (before.number ?? null) !== (after.number ?? null) ||
    (before.complement ?? null) !== (after.complement ?? null) ||
    (before.district ?? null) !== (after.district ?? null) ||
    (before.city ?? null) !== (after.city ?? null) ||
    (before.state ?? null) !== (after.state ?? null)
  )
}
