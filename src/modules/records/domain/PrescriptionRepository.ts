import type { NewPrescriptionData, Prescription } from './Prescription'

export type PrescriptionErrorReason =
  | 'forbidden'
  | 'not-found'
  | 'unavailable'
  | 'unexpected'

export class PrescriptionRepositoryError extends Error {
  constructor(
    readonly reason: PrescriptionErrorReason,
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'PrescriptionRepositoryError'
  }
}

export function isPrescriptionRepositoryError(
  cause: unknown,
): cause is PrescriptionRepositoryError {
  return cause instanceof PrescriptionRepositoryError
}

/**
 * Ler e acrescentar. **Não há update nem delete, e a ausência é o schema.**
 *
 * Nem `prescriptions` nem `prescription_items` têm `updated_at` ou
 * `deleted_at`. Prescrição corrigida é prescrição nova: a anterior é o que o
 * paciente levou na mão.
 *
 * Também não há `sign` nem `send`: assinatura e emissão dependem de um sistema
 * externo que não existe, e um método com esse nome seria convite para alguém
 * simular o que ele faria.
 */
export interface PrescriptionRepository {
  listByPatient(clinicId: string, patientId: string): Promise<Prescription[]>
  /**
   * O paciente pertence a esta clínica?
   *
   * A FK de `prescriptions.patient_id` é de COLUNA ÚNICA — prova que o paciente
   * existe em algum lugar do banco, não que existe aqui. Mesma lacuna de
   * `vitals`, mesma guarda.
   */
  patientBelongsTo(clinicId: string, patientId: string): Promise<boolean>
  /** O atendimento é desta clínica **e** deste paciente? */
  encounterBelongsTo(
    clinicId: string,
    encounterId: string,
    patientId: string,
  ): Promise<boolean>
  /**
   * Cria a prescrição e seus itens.
   *
   * `authorId` é `professionals.id`, resolvido por `current_professional_id()`
   * no servidor — nunca vem do cliente. Aceitá-lo do formulário deixaria
   * alguém prescrever em nome de outro profissional.
   */
  create(
    clinicId: string,
    authorId: string,
    data: NewPrescriptionData,
  ): Promise<Prescription>
}
