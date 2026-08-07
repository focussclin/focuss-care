import type { Paginated } from '@/modules/_shared/domain/Paginated'
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

/** Estados de cadastro que o banco sabe filtrar — `patients.is_active`. */
export type PatientStatusFilter = 'all' | 'active' | 'inactive'

/**
 * Recorte de uma pagina da listagem.
 *
 * Tudo aqui ja passou pelo schema da rota (`patientListQuerySchema`): o termo
 * chega sanitizado, o limite chega clampado e o cursor chega como string opaca
 * ainda NAO confiavel — quem valida o cursor e o adapter, contra o tenant ativo.
 */
export interface PatientListQuery {
  /** Termo ja normalizado e sanitizado, ou null quando a busca esta vazia. */
  search: string | null
  status: PatientStatusFilter
  /** Ja clampado: 1..PATIENT_PAGE_MAX_SIZE. O adapter clampa de novo. */
  limit: number
  /** Cursor opaco vindo da URL, ou null para a primeira pagina. */
  cursor: string | null
}

export interface PatientPage extends Paginated<Patient> {
  /**
   * `false` quando havia cursor na URL e ele NAO foi usado — expirado, forjado,
   * de outro tenant, ou de outro recorte de filtro.
   *
   * Existe para a tela poder dizer "Mostrando do inicio" em vez de servir a
   * primeira pagina fingindo que era a pedida. Silencio, aqui, seria mentira.
   */
  cursorApplied: boolean
}

/**
 * Numeros do topo da listagem.
 *
 * Existem como consulta PROPRIA, e nao derivados da pagina: com paginacao,
 * `items.length` e o tamanho da pagina, nunca o total da clinica.
 */
export interface PatientMetrics {
  /** Pacientes nao excluidos da clinica ativa, incluindo arquivados. */
  total: number
  /** Cadastrados desde o primeiro dia do mes de referencia. */
  newThisMonth: number
  /**
   * Agendamentos futuros nao cancelados.
   *
   * Conta **atendimentos**, nao pacientes — e o que o rotulo do card diz. Um
   * paciente com tres consultas marcadas soma tres.
   */
  pendingAppointments: number
}

/**
 * PORTA do modulo de pacientes.
 *
 * Os casos de uso e os Server Components dependem desta interface, nunca do SDK do
 * Supabase. Trocar o backend um dia mexe apenas em infrastructure/.
 */
export interface PatientRepository {
  /**
   * Uma pagina de pacientes da clinica ativa, em ordem `(full_name, id)`.
   *
   * **Nao existe metodo que liste a clinica inteira.** Havia (`listByClinic`), e
   * era um defeito latente de escala: toda renderizacao trazia a base completa
   * para a memoria do servidor e para o payload RSC. Quem precisa de "todos"
   * precisa, na verdade, de um limite explicito — e paga o preco de declara-lo.
   */
  listPage(clinicId: string, query: PatientListQuery): Promise<PatientPage>

  /**
   * Contagens do resumo, em consultas `head` que nao transferem linha.
   *
   * `reference` e o "hoje" ja normalizado pela rota — o mes vem dele, nao de um
   * `new Date()` escondido no adapter.
   */
  countMetrics(clinicId: string, reference: Date): Promise<PatientMetrics>

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
