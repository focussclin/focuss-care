import type { NewVitalsData, VitalsEntry } from './Vitals'

export type VitalsRepositoryErrorReason =
  | 'forbidden'
  | 'not-found'
  | 'unavailable'
  | 'unexpected'

export class VitalsRepositoryError extends Error {
  constructor(
    readonly reason: VitalsRepositoryErrorReason,
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'VitalsRepositoryError'
  }
}

export function isVitalsRepositoryError(
  cause: unknown,
): cause is VitalsRepositoryError {
  return cause instanceof VitalsRepositoryError
}

/**
 * Só ler e acrescentar.
 *
 * **Não há `update` nem `delete`, e a ausência é o desenho do schema.**
 * `vitals` não tem `updated_at` nem `deleted_at`: é uma medida feita em um
 * instante, e corrigir significa registrar de novo. Um método de edição aqui
 * seria um convite para alguém implementá-lo sobrescrevendo a aferição
 * original — que é a única prova de o que se mediu naquela hora.
 *
 * Isso também dispensa a distinção `write-forbidden`/`not-found` que os outros
 * módulos precisam fazer: sem UPDATE, não existe o caso de zero linhas
 * afetadas em silêncio. Recusa de policy no INSERT vem como erro do Postgres.
 */
export interface VitalsRepository {
  listByPatient(clinicId: string, patientId: string): Promise<VitalsEntry[]>
  /**
   * O paciente pertence a esta clínica?
   *
   * A FK de `vitals.patient_id` é de COLUNA ÚNICA — aponta para `patients.id` e
   * mais nada. Ela prova que o paciente existe em algum lugar do banco, não que
   * existe AQUI. (As FKs compostas `(id, clinic_id)` das migrations locais
   * fazem isso; esta tabela é do schema original e não tem uma.)
   *
   * Sem esta checagem, um `patientId` de outra clínica seria aceito pela FK e
   * gravaria uma aferição com o `clinic_id` correto apontando para o paciente
   * errado — invisível para quem lê a ficha certa.
   */
  patientBelongsTo(clinicId: string, patientId: string): Promise<boolean>
  /**
   * O atendimento é desta clínica **e** deste paciente?
   *
   * Duas condições, e a segunda não é redundante: dentro da mesma clínica, um
   * `encounterId` de outro paciente também passaria pela FK. A aferição ficaria
   * pendurada no atendimento de outra pessoa.
   */
  encounterBelongsTo(
    clinicId: string,
    encounterId: string,
    patientId: string,
  ): Promise<boolean>
  record(
    clinicId: string,
    recordedBy: string,
    data: NewVitalsData,
  ): Promise<VitalsEntry>
}
