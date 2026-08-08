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

export interface MedicalRecord {
  id: string
  patientId: string
  /** Atendimento que originou o registro, quando houve um. */
  encounterId: string | null
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
