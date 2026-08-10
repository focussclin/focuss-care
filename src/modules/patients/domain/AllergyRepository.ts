import type { Allergy, AllergyUpdateData, NewAllergyData } from './Allergy'

export type AllergyRepositoryErrorReason =
  | 'forbidden'
  /**
   * A linha é legível, mas a escrita não a alcançou.
   *
   * Sem policy de INSERT/UPDATE em `allergies` para o papel, o Postgres não
   * devolve erro: zero linhas mudam, em silêncio. Chamar isso de "não
   * encontrado" mandaria procurar uma alergia que está na tela.
   */
  | 'write-forbidden'
  | 'duplicate'
  | 'not-found'
  | 'unavailable'
  | 'unexpected'

export class AllergyRepositoryError extends Error {
  constructor(
    readonly reason: AllergyRepositoryErrorReason,
    message: string,
    readonly code?: string,
  ) {
    super(message)
    this.name = 'AllergyRepositoryError'
  }
}

export function isAllergyRepositoryError(
  cause: unknown,
): cause is AllergyRepositoryError {
  return cause instanceof AllergyRepositoryError
}

export interface AllergyRepository {
  listByPatient(clinicId: string, patientId: string): Promise<Allergy[]>
  /**
   * Existe para a edicao saber a QUAL paciente a linha pertence.
   *
   * O input da edicao traz o id da alergia, nao o do paciente. Aceitar um
   * `patientId` vindo do cliente deixaria alguem apontar a checagem de
   * duplicidade para outra ficha; ler daqui resolve sem essa porta lateral.
   */
  findById(clinicId: string, allergyId: string): Promise<Allergy | null>
  record(clinicId: string, recordedBy: string, data: NewAllergyData): Promise<Allergy>
  update(clinicId: string, allergyId: string, data: AllergyUpdateData): Promise<Allergy>
  /**
   * Ativa e desativa — **não existe exclusão**.
   *
   * Uma alergia registrada por engano continua sendo história clínica: alguém
   * afirmou aquilo, e decisões podem ter sido tomadas com base nisso. Apagar a
   * linha apagaria o registro de que a informação existiu.
   */
  setActive(clinicId: string, allergyId: string, isActive: boolean): Promise<Allergy>
}
