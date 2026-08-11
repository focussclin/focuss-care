import type {
  MedicalRecord,
  RecordEncounter,
  RecordType,
} from './MedicalRecord'

/** Dados de um registro novo, já normalizados pela camada de aplicação. */
export interface NewRecordData {
  patientId: string
  encounterId: string | null
  recordType: RecordType
  content: string
}

/**
 * QUAL leitura de prontuário aconteceu.
 *
 * O alvo é **declarado, não deduzido**. Antes ele saía de `patientId ?? 'list'`,
 * o que bastava enquanto havia duas superfícies: a listagem da clínica e a ficha
 * de um paciente. O histórico de versões é uma terceira, e é sobre o mesmo
 * paciente da ficha — deduzir do id devolveria `patient` para os dois, e a
 * trilha não saberia distinguir "abriu a ficha" de "leu as versões anteriores de
 * um registro corrigido", que é exatamente a pergunta que se faz numa
 * investigação.
 *
 * O tipo é discriminado para que a combinação inválida não exista: não há como
 * registrar leitura de versões sem paciente, nem a listagem da clínica com um.
 */
export type RecordAccess =
  | { target: 'list' }
  | { target: 'patient' | 'versions'; patientId: string }

/**
 * PORTA do prontuário.
 *
 * # Não existe `update` e não existe `delete`
 *
 * A ausência é o contrato. `medical_records` é append-only: corrigir é
 * `amend`, que **insere** uma linha nova apontando para a anterior por
 * `supersedes_id`. Um método `update` aqui seria a porta pela qual alguém
 * reescreveria a história clínica de um paciente — e o §8 do roadmap proíbe
 * `DELETE` em qualquer tabela.
 *
 * Se um registro foi feito por engano, a correção é uma versão nova dizendo
 * isso. O engano continua legível, que é exatamente o ponto.
 */
export interface MedicalRecordRepository {
  /**
   * Registros VIGENTES de um paciente — a última versão de cada cadeia.
   *
   * Lê de `v_medical_records_current`, que é a view que o banco mantém para
   * isso. Reimplementar o "qual é a última versão" na aplicação daria uma
   * segunda regra para divergir da do banco.
   */
  listCurrentByPatient(
    clinicId: string,
    patientId: string,
    limit: number,
  ): Promise<MedicalRecord[]>

  /** Registros vigentes mais recentes da clínica, para a tela de prontuários. */
  listRecent(clinicId: string, limit: number): Promise<MedicalRecord[]>

  /**
   * Atendimentos do paciente aos quais um registro pode ser vinculado.
   *
   * Do mais recente para o mais antigo, **incluindo os encerrados**: a evolução
   * costuma ser escrita depois que a consulta termina, e oferecer só o que está
   * aberto obrigaria o profissional a registrar antes de encerrar — ou a deixar
   * o registro solto, que é o estado que esta fatia veio corrigir.
   *
   * Atendimento `canceled` fica de fora: vincular a evolução a uma consulta que
   * a clínica declarou não ter acontecido é contradição registrada em prontuário.
   */
  listPatientEncounters(
    clinicId: string,
    patientId: string,
    limit: number,
  ): Promise<RecordEncounter[]>

  /**
   * Este atendimento é desta clínica E deste paciente?
   *
   * As FKs de `medical_records` são de coluna única: provam que o atendimento
   * existe, não que ele pertence ao inquilino nem ao paciente do registro. Sem
   * esta conferência, um `encounter_id` vindo do formulário penduraria a evolução
   * de uma pessoa no atendimento de outra — e o banco aceitaria.
   */
  encounterBelongsTo(
    clinicId: string,
    encounterId: string,
    patientId: string,
  ): Promise<boolean>

  /**
   * A cadeia inteira de versões de um registro, da mais nova para a mais antiga.
   *
   * É o que torna o append-only visível para quem audita: sem poder ver as
   * versões anteriores, "não editamos, versionamos" é só uma afirmação.
   */
  listVersions(clinicId: string, recordId: string): Promise<MedicalRecord[]>

  /**
   * Cria a primeira versão de um registro.
   *
   * `authorId` é `professionals.id`, resolvido no servidor por
   * `current_professional_id()` — não vem do cliente. Quem não é profissional
   * na clínica ativa não tem id, e portanto não assina prontuário.
   */
  create(
    clinicId: string,
    data: NewRecordData,
    authorId: string,
    authorUserId: string,
  ): Promise<MedicalRecord>

  /**
   * Corrige um registro criando a versão seguinte.
   *
   * Não altera a linha anterior. A nova aponta para ela por `supersedes_id` e
   * recebe `version + 1`.
   */
  amend(
    clinicId: string,
    recordId: string,
    content: string,
    authorId: string,
    authorUserId: string,
  ): Promise<MedicalRecord>

  /**
   * Registra que alguém LEU o prontuário.
   *
   * Existe na porta, e não escondido no adapter, porque é requisito de
   * conformidade e não detalhe de implementação: quem trocar o backend precisa
   * saber que isto tem de continuar acontecendo.
   *
   * **A listagem não tem paciente**, e por isso `RecordAccess` é discriminado: a
   * rota `/prontuarios` mostra os registros recentes da clínica inteira, e ali
   * não há um alvo — o evento diz que houve leitura e o escopo vai em `after`.
   * Antes isto era a string `'all'` no lugar do id, que o Postgres recusava
   * (`entity_id` é `uuid`), e a linha inteira era descartada em silêncio.
   */
  logAccess(clinicId: string, access: RecordAccess): Promise<void>
}
