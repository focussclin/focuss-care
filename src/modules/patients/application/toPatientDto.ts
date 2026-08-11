import type { Patient } from '@/modules/_shared/domain/types'

import type { PatientDto } from '../schemas/patient.schema'

/**
 * Forma mínima enviada para a listagem Client Component.
 * Documento e observação administrativa ficam exclusivamente no perfil server-side.
 */
export type PatientListItem = Omit<
  Patient,
  'document' | 'adminNotes' | 'contactPreference'
>

export function toPatientListItem(patient: Patient): PatientListItem {
  return {
    id: patient.id,
    name: patient.name,
    socialName: patient.socialName ?? null,
    phone: patient.phone,
    email: patient.email,
    birthDate: patient.birthDate,
    status: patient.status,
    createdAt: patient.createdAt,
    lastVisitAt: patient.lastVisitAt,
    nextVisitAt: patient.nextVisitAt,
  }
}

/**
 * Entidade do dominio -> o que atravessa a fronteira da Server Action.
 *
 * A conversao existe porque `Patient` tem `Date`, e o que uma Server Action
 * devolve e serializado antes de chegar ao navegador. Datas viram string ISO;
 * campos que a tela nao precisa (visitas, documento) ficam de fora.
 *
 * Um lugar so para os tres casos de uso — criar, editar e arquivar devolvem
 * exatamente a mesma forma, e e isso que deixa o container tratar os tres com o
 * mesmo codigo.
 */
export function toPatientDto(patient: Patient): PatientDto {
  return {
    id: patient.id,
    name: patient.name,
    phone: patient.phone,
    email: patient.email,
    birthDate: toIsoDate(patient.birthDate),
    createdAt: patient.createdAt.toISOString(),
    isActive: patient.status !== 'inactive',
  }
}

/**
 * 'YYYY-MM-DD' no fuso LOCAL do servidor.
 *
 * `toISOString().slice(0,10)` converteria para UTC e devolveria o dia anterior
 * para qualquer data montada a meia-noite no horario do Brasil — que e
 * exatamente como o `patientMapper` monta a data de nascimento.
 *
 * Exportada porque o `<input type="date">` do formulario de edicao e a comparacao
 * de campos alterados precisam da mesma forma. Tres conversoes ligeiramente
 * diferentes de data e como nasce bug de fuso.
 */
export function toIsoDate(date: Date | null): string | null {
  if (!date) return null

  return toIsoDateStrict(date)
}

function toIsoDateStrict(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${date.getFullYear()}-${month}-${day}`
}
