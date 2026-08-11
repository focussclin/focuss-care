import type {
  Encounter,
  EncounterMetrics,
  QueueEntry,
} from './Encounter'

/** Dados de uma chegada — o que a recepção sabe quando o paciente aparece. */
export interface CheckInData {
  patientId: string
  /** Vincula à agenda quando existe hora marcada; null em encaixe. */
  appointmentId: string | null
  /** Quem vai atender, se já estiver definido. */
  professionalId: string | null
  priority: number
  reason: string | null
}

/**
 * PORTA do módulo de atendimento.
 *
 * O ciclo que ela modela é o da recepção, e a ordem importa:
 *
 * ```
 * chegou          -> waiting     (checkIn)
 * foi chamado     -> called      (call)
 * entrou na sala  -> in_service  (start, e nasce o encounter)
 * saiu            -> done        (close, e o encounter fecha)
 * ```
 *
 * Cada passo é uma transição explícita porque cada um é uma pergunta que a
 * clínica precisa responder depois: quanto tempo esperou, se foi chamado e não
 * respondeu, quanto durou o atendimento.
 */
export interface EncounterRepository {
  /** Fila do dia, em ordem de prioridade e depois de chegada. */
  listQueue(clinicId: string, day: Date): Promise<QueueEntry[]>

  /** Atendimentos do dia, abertos e encerrados. */
  listEncounters(clinicId: string, day: Date): Promise<Encounter[]>

  /** Contagens do topo, em consultas `head` que não transferem linha. */
  countMetrics(clinicId: string, day: Date): Promise<EncounterMetrics>

  /**
   * Registra a chegada: a pessoa entra na fila como `waiting`.
   *
   * **Não recebe `createdBy`**, ao contrário das escritas dos outros módulos:
   * `waiting_queue` não tem coluna de autor no schema remoto. Carregar o
   * parâmetro assim mesmo sugeriria uma rastreabilidade que a tabela não dá —
   * quem registrou a chegada fica no `audit_log`, que deriva o ator da sessão.
   */
  checkIn(clinicId: string, data: CheckInData): Promise<QueueEntry>

  /**
   * Chama a pessoa — `waiting` -> `called`.
   *
   * Passo próprio, e não parte de `start`, porque "chamei e ninguém veio" é uma
   * informação que a clínica precisa ter. Sem ele, a espera de quem não
   * respondeu ficaria indistinguível da espera de quem ainda não foi chamado.
   */
  call(clinicId: string, queueEntryId: string): Promise<QueueEntry>

  /**
   * Inicia o atendimento: a fila vai para `in_service` e **nasce o encounter**.
   *
   * As duas coisas descrevem o mesmo instante por ângulos diferentes — a fila é
   * o ponto de vista da recepção, o encounter é o do prontuário.
   */
  start(
    clinicId: string,
    queueEntryId: string,
    professionalId: string,
    createdBy: string,
  ): Promise<Encounter>

  /**
   * Encerra: o encounter fecha e a fila vai para `done`.
   *
   * Encerrar **não apaga** e não é cancelar. O atendimento aconteceu, e o
   * registro de que aconteceu é o que sustenta prontuário e faturamento.
   */
  close(clinicId: string, encounterId: string): Promise<Encounter>

  /**
   * Registra ou corrige a queixa principal — feature **E-03**.
   *
   * Só alcanca atendimento ABERTO, e a condicao vai no `WHERE`: entre a tela
   * carregar e o clique chegar, outra pessoa pode ter encerrado o atendimento, e
   * gravar por cima mudaria a justificativa de uma conduta ja tomada.
   *
   * `null` apaga o que estava la — corrigir para vazio e edicao legitima
   * enquanto a consulta corre, e uma queixa errada e pior que nenhuma.
   */
  setChiefComplaint(
    clinicId: string,
    encounterId: string,
    complaint: string | null,
  ): Promise<Encounter>
}
