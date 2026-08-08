import type { ConsentPurpose } from '@/lib/supabase/database.types'

/**
 * PORTA dos consentimentos LGPD de um paciente (P-03 do roadmap).
 *
 * A tabela `consents` do schema remoto e generica: guarda `subject_type` +
 * `subject_id`, entao a mesma tabela atende paciente, membro de equipe e o que
 * mais vier. Esta porta cobre **um unico recorte** — `subject_type = 'patient'`.
 * Nao ha metodo aqui que aceite outro sujeito, e isso e deliberado: um
 * repositorio "de consentimentos" generico seria um caminho pronto para ler o
 * consentimento de outra entidade a partir de um id de paciente.
 *
 * ## O que a porta NAO expoe, e por que
 *
 *  - **`clinic_id`.** Entra como parametro de cada metodo, vindo do
 *    `ActionContext`/`resolveDataSource`, nunca do formulario (P3 de
 *    docs/01-arquitetura.md). Nao volta em nenhuma leitura: quem chamou ja sabe
 *    em qual clinica esta, e o valor nao tem por que atravessar a fronteira da
 *    Server Action.
 *  - **`ip` e `user_agent`.** As duas colunas existem em `consents` e as duas sao
 *    dado pessoal (LGPD art. 5, I). O adapter nunca as seleciona, entao nao ha
 *    caminho por onde elas cheguem a um Client Component — a garantia e a
 *    ausencia do campo no tipo, nao a disciplina de quem monta o DTO.
 *  - **`subject_type` / `subject_id`.** Sao detalhe da modelagem generica da
 *    tabela. Quem consome esta porta fala de paciente, nao de "sujeito".
 *
 * ## Limite de infraestrutura, declarado
 *
 * **Nao ha unique constraint** em `(clinic_id, subject_type, subject_id, purpose)`
 * onde `revoked_at is null`, e nao ha FK de `subject_id` para `patients` — o
 * schema remoto e o que esta em `src/lib/supabase/database.types.ts`, e nenhum dos
 * dois aparece la. As consequencias praticas estao em
 * docs/07-cadastro-de-pacientes.md §9.5; a porta nao finge atomicidade que o banco
 * nao oferece.
 */

/**
 * As finalidades que esta fatia trata, na ordem em que a tela as mostra.
 *
 * `satisfies readonly ConsentPurpose[]` amarra a lista ao enum `consent_purpose`
 * do banco: inventar um proposito aqui nao compila (P1 — o banco e a fonte de
 * verdade). A direcao contraria — o banco ganhar um proposito que a lista nao
 * cobre — e pega por `toPatientConsentPurpose`, abaixo.
 */
export const PATIENT_CONSENT_PURPOSES = [
  'terms_of_service',
  'privacy_policy',
  'health_data_processing',
  'marketing_communication',
  'ai_assisted_processing',
] as const satisfies readonly ConsentPurpose[]

export type PatientConsentPurpose = (typeof PATIENT_CONSENT_PURPOSES)[number]

/**
 * Estreita um proposito vindo do banco para o vocabulario desta fatia.
 *
 * O `return` e a prova de cobertura: hoje `ConsentPurpose` e exatamente
 * `PatientConsentPurpose`, entao ele compila. No dia em que alguem acrescentar um
 * valor ao enum `consent_purpose` e rodar `npm run db:types`, este arquivo para de
 * compilar — que e o resultado desejado. O contrario (a tela simplesmente ignorar
 * uma finalidade que ja esta sendo registrada no banco) seria uma omissao
 * silenciosa em cima de um registro legal.
 */
export function toPatientConsentPurpose(
  purpose: ConsentPurpose,
): PatientConsentPurpose {
  return purpose
}

/**
 * Um registro de consentimento, ja mapeado.
 *
 * `revokedAt === null` significa consentimento **vigente**. Revogar nao apaga a
 * linha: carimba a data. O historico e o registro legal — apagar seria destruir a
 * prova de que o consentimento existiu (§8 do roadmap: exclusao e logica, nunca
 * `DELETE`).
 */
export interface PatientConsent {
  id: string
  purpose: PatientConsentPurpose
  /** Versao do documento aceito. Decidida no servidor, nunca pelo navegador. */
  documentVersion: string
  grantedAt: Date
  /** `null` enquanto vigente. */
  revokedAt: Date | null
}

/** O que uma concessao precisa. Note que `clinicId` e `patientId` NAO estao aqui. */
export interface GrantPatientConsentData {
  purpose: PatientConsentPurpose
  /** Vem de `application/consentDocumentVersions.ts`, nunca da entrada. */
  documentVersion: string
  grantedAt: Date
}

export interface PatientConsentRepository {
  /**
   * Todos os registros do paciente na clinica ativa, do mais recente para o mais
   * antigo. Inclui os revogados: a tela precisa saber que houve consentimento e
   * que ele foi retirado — "nunca registrado" e "revogado" sao estados diferentes.
   */
  listByPatient(
    clinicId: string,
    patientId: string,
  ): Promise<PatientConsent[]>

  /**
   * Registra uma concessao nova.
   *
   * Falha esperada sai como `PatientRepositoryError` — a mesma classe do resto do
   * modulo, porque o vocabulario de recusa e identico (conflito, policy, rede) e
   * duas hierarquias de erro para o mesmo modulo so multiplicariam o `switch`.
   */
  grant(
    clinicId: string,
    patientId: string,
    data: GrantPatientConsentData,
  ): Promise<PatientConsent>

  /**
   * Carimba `revoked_at` em **todos** os registros vigentes daquele paciente e
   * finalidade.
   *
   * O plural nao e zelo excessivo: sem unique constraint no banco, duas
   * concessoes simultaneas podem deixar duas linhas vigentes. Revogar apenas uma
   * deixaria a outra ativa e a tela diria "revogado" com o consentimento ainda de
   * pe — a pior forma de errar aqui.
   *
   * Devolve o que foi revogado. Lista vazia significa que nao havia nada vigente.
   */
  revokeActive(
    clinicId: string,
    patientId: string,
    purpose: PatientConsentPurpose,
    revokedAt: Date,
  ): Promise<PatientConsent[]>
}
