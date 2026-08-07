import type { Patient } from '@/modules/_shared/domain/types'

/**
 * Dados de um cadastro novo, ja normalizados pela camada de aplicacao.
 *
 * O que NAO esta aqui e tao importante quanto o que esta:
 *
 *  - **`clinicId` e `createdBy` nao sao campos do formulario.** Chegam como
 *    parametros proprios de `create`, vindos do `ActionContext` — P3 de
 *    docs/01-arquitetura.md. Se morassem neste objeto, um dia alguem os
 *    preencheria com o que o cliente mandou.
 *  - **`biological_sex` nao aparece.** O formulario atual nao coleta sexo
 *    biologico, e a coluna e obrigatoria no schema remoto; o adapter grava
 *    'not_informed'. Inventar um valor aqui seria inventar dado clinico.
 *  - **CPF, CNS, endereco, contato de emergencia e foto** ficam para a fatia de
 *    edicao (P-01 completa). O cadastro e o minimo que a recepcao precisa.
 */
export interface NewPatientData {
  fullName: string
  /** ISO 'YYYY-MM-DD', ou null quando nao informada. */
  birthDate: string | null
  /** Somente digitos (DDD + numero), ou null. Ver `lib/utils/phone`. */
  phone: string | null
  /** Minusculo e sem espaco nas bordas, ou null. */
  email: string | null
  /** Observacao administrativa do cadastro. Nao e dado clinico. */
  adminNotes: string | null
}

/**
 * PORTA do modulo de pacientes.
 *
 * Os casos de uso e os Server Components dependem desta interface, nunca do SDK do
 * Supabase. Trocar o backend um dia mexe apenas em infrastructure/.
 */
export interface PatientRepository {
  /** Pacientes da clinica ativa, ordenados por nome. */
  listByClinic(clinicId: string): Promise<Patient[]>

  findById(clinicId: string, patientId: string): Promise<Patient | null>

  /**
   * Cria o paciente e devolve a entidade ja mapeada.
   *
   * Falha esperada (conflito, recusa de policy) sai como
   * `PatientRepositoryError` — a action a traduz em `Result`. Lancar aqui, em vez
   * de devolver `Result`, mantem a porta com uma forma so para leitura e escrita.
   */
  create(
    clinicId: string,
    data: NewPatientData,
    createdBy: string,
  ): Promise<Patient>

  /**
   * Atualiza os dados de cadastro. Substitui os campos recebidos — campo vazio
   * vira `null`, e apagar um telefone e uma edicao legitima, nao um engano.
   *
   * Paciente de outra clinica e paciente inexistente dao no mesmo:
   * `PatientRepositoryError('not-found')`. A resposta nao pode revelar que o id
   * existe em outro tenant.
   */
  update(
    clinicId: string,
    patientId: string,
    data: NewPatientData,
  ): Promise<Patient>

  /**
   * Arquiva (`is_active = false`) ou reativa o cadastro.
   *
   * Arquivar NAO e excluir: a linha continua na base, sai das listagens de ativos
   * e volta quando alguem reativa. Exclusao e logica (`deleted_at`) e nao faz
   * parte desta fatia — §8 do roadmap proibe `DELETE` de qualquer forma.
   */
  setArchived(
    clinicId: string,
    patientId: string,
    archived: boolean,
  ): Promise<Patient>
}
