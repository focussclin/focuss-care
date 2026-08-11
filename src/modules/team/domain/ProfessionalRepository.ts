import type { NewProfessionalData, Professional } from './Professional'

export type ProfessionalErrorReason =
  | 'forbidden'
  /**
   * O profissional é legível, mas a escrita não alcançou a linha.
   *
   * Sem policy de UPDATE em `professionals` para o papel, o Postgres não devolve
   * erro: zero linhas mudam, em silêncio.
   */
  | 'write-forbidden'
  /** `23505` — o mesmo usuário já está vinculado a outro profissional. */
  | 'user-already-linked'
  | 'not-found'
  | 'unavailable'
  | 'unexpected'

export class ProfessionalError extends Error {
  constructor(
    readonly reason: ProfessionalErrorReason,
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'ProfessionalError'
  }
}

export function isProfessionalError(cause: unknown): cause is ProfessionalError {
  return cause instanceof ProfessionalError
}

export interface ProfessionalRepository {
  list(clinicId: string): Promise<Professional[]>
  create(clinicId: string, data: NewProfessionalData): Promise<Professional>
  update(
    clinicId: string,
    professionalId: string,
    data: NewProfessionalData,
  ): Promise<Professional>
  setActive(
    clinicId: string,
    professionalId: string,
    isActive: boolean,
  ): Promise<Professional>
  /**
   * O usuário pertence a esta clínica?
   *
   * `professionals.user_id` referencia `profiles.id` — coluna única, que prova
   * que o usuário existe em algum lugar do banco, não que é membro DESTA
   * clínica. Vincular alguém de fora daria a ele a assinatura clínica daqui.
   */
  userBelongsToClinic(clinicId: string, userId: string): Promise<boolean>
}
