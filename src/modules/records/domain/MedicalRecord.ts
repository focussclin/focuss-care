/**
 * Tipos do prontuário.
 *
 * O prontuário é o dado mais sensível do produto: registro clínico, protegido
 * por sigilo profissional e pela LGPD como dado de saúde. Duas propriedades
 * atravessam este módulo inteiro e não são negociáveis:
 *
 *  1. **Append-only.** Corrigir uma evolução não reescreve a anterior — cria
 *     uma versão nova que aponta para ela. O que foi registrado às 9h continua
 *     legível às 18h, mesmo depois de corrigido. Prontuário que pode ser
 *     editado no lugar não serve como prova de nada.
 *  2. **Leitura é auditada.** Nos outros módulos audita-se a escrita; aqui,
 *     abrir também é um ato — é o que permite responder "quem leu o prontuário
 *     desta paciente?".
 */

/** Espelha o enum `record_type` do banco. */
export type RecordType =
  | 'anamnesis'
  | 'evolution'
  | 'physical_exam'
  | 'diagnosis'
  | 'procedure'
  | 'exam_request'
  | 'referral'
  | 'certificate'
  | 'note'

/** Espelha o enum `encounter_status` do banco. */
export type RecordEncounterStatus = 'open' | 'closed' | 'canceled'

/**
 * O atendimento visto pelo PRONTUÁRIO.
 *
 * Não é a entidade `Encounter` do módulo de atendimento, e a duplicação é
 * deliberada: a regra 4 da arquitetura proíbe um módulo importar o interior de
 * outro, e o que o prontuário precisa saber de um atendimento é bem menos do que
 * a fila precisa — sem `patientName` (o registro já sabe de quem é), sem
 * `appointmentId`, sem `endedAt` de operação.
 *
 * `chiefComplaint` viaja porque é a informação que dá sentido ao vínculo: o
 * registro responde "o que foi feito", e a queixa responde "por quê". Ela é dado
 * clínico e só alcança quem tem `record.read` — a mesma trava que protege o
 * conteúdo do registro.
 */
export interface RecordEncounter {
  id: string
  status: RecordEncounterStatus
  startedAt: Date
  /** Null quando o atendimento segue aberto. */
  endedAt: Date | null
  /** Null quando o nome do profissional não pôde ser lido — é rótulo. */
  professionalName: string | null
  /** Queixa principal, registrada por quem atendeu. Null quando ninguém registrou. */
  chiefComplaint: string | null
}

export interface MedicalRecord {
  id: string
  patientId: string
  /** Atendimento que originou o registro, quando houve um. */
  encounterId: string | null
  /**
   * O atendimento vinculado, quando foi possível lê-lo.
   *
   * **Null não significa "sem vínculo"** — quem responde isso é `encounterId`.
   * O contexto vem de uma segunda consulta (a view do prontuário não declara
   * relacionamento e não aceita join), e essa consulta pode voltar vazia: o
   * atendimento pode ter sido lido por um papel sem acesso a ele, ou a consulta
   * pode ter falhado. Nesse caso o registro continua legível e a tela diz que há
   * um atendimento por trás, sem inventar qual.
   */
  encounter: RecordEncounter | null
  /** `professionals.id` — quem assina clinicamente, não quem digitou. */
  authorId: string
  authorName: string
  recordType: RecordType
  /** Texto do registro. Estrutura mais rica fica para quando houver formulário. */
  content: string
  /**
   * Versão desta linha na cadeia. A primeira é 1; corrigir cria a 2, e assim
   * por diante.
   */
  version: number
  /** Versão que esta substitui. Null na primeira. */
  supersedesId: string | null
  /** Assinado clinicamente. Null enquanto não assinado. */
  signedAt: Date | null
  createdAt: Date
}
