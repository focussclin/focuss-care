import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import {
  toPatientConsentPurpose,
  type GrantPatientConsentData,
  type PatientConsent,
  type PatientConsentPurpose,
  type PatientConsentRepository,
} from '../domain/PatientConsentRepository'
import { PatientRepositoryError } from '../domain/PatientRepositoryError'
import { readFailure, toPatientWriteError } from './postgrestFailure'

type Client = SupabaseClient<Database>

/**
 * Colunas que saem de `consents` — e as que **nunca** saem.
 *
 * Ficam de fora, deliberadamente:
 *
 *  - `ip` e `user_agent`: dado pessoal (LGPD art. 5, I). Existem na tabela porque
 *    o registro de consentimento os coleta; nao existem em nenhuma leitura porque
 *    este caminho termina em props de Client Component.
 *  - `clinic_id`: quem consulta ja sabe em qual clinica esta — foi ele quem passou
 *    o filtro. Devolver a clinica so criaria mais um lugar de onde ela poderia
 *    vazar para a tela.
 *  - `subject_type` e `subject_id`: sao o filtro desta consulta, nao resultado
 *    dela. Se aparecessem, seriam sempre 'patient' e o id que o chamador ja tem.
 */
const CONSENT_COLUMNS = 'id, purpose, document_version, granted_at, revoked_at'

/** O unico `subject_type` que este adapter le ou escreve. */
const SUBJECT_TYPE = 'patient'

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Forma da linha que `CONSENT_COLUMNS` traz. */
interface ConsentRow {
  id: string
  purpose: Database['public']['Tables']['consents']['Row']['purpose']
  document_version: string
  granted_at: string
  revoked_at: string | null
}

/**
 * Adapter Supabase dos consentimentos de paciente (P-03).
 *
 * ## Os tres filtros que fecham toda consulta
 *
 *     .eq('clinic_id', clinicId)          <- tenant, vindo da sessao
 *     .eq('subject_type', SUBJECT_TYPE)   <- so paciente
 *     .eq('subject_id', patientId)        <- so este paciente, ja validado como uuid
 *
 * Os tres sao explicitos mesmo com RLS ativa, e cada um responde por um risco
 * diferente:
 *
 *  - `clinic_id` e defesa em profundidade — a RLS impede o vazamento, o filtro
 *    impede a consulta errada e mantem a query alinhada ao indice.
 *  - `subject_type` importa porque a tabela e GENERICA. Sem ele, um `subject_id`
 *    que coincidisse com o id de outro tipo de sujeito devolveria o consentimento
 *    errado — e a RLS nao teria nada a reclamar, porque a linha e da mesma clinica.
 *  - `subject_id` validado como uuid porque a coluna nao tem FK para `patients`
 *    (ver §9.5 de docs/07-cadastro-de-pacientes.md). O banco aceitaria qualquer
 *    texto; o formato e a unica checagem que existe deste lado.
 *
 * O cliente vem por construtor, sempre com a sessao do usuario. Nenhum caminho
 * daqui alcanca `SUPABASE_SECRET_KEY` — P2 do roadmap.
 */
export class SupabasePatientConsentRepository
  implements PatientConsentRepository
{
  constructor(private readonly client: Client) {}

  async listByPatient(
    clinicId: string,
    patientId: string,
  ): Promise<PatientConsent[]> {
    assertPatientId(patientId)

    const { data, error } = await this.client
      .from('consents')
      .select(CONSENT_COLUMNS)
      .eq('clinic_id', clinicId)
      .eq('subject_type', SUBJECT_TYPE)
      .eq('subject_id', patientId)
      .order('granted_at', { ascending: false })

    if (error) {
      throw readFailure(
        'consents.listByPatient',
        error,
        'Falha ao carregar os consentimentos do paciente.',
      )
    }

    return ((data ?? []) as ConsentRow[]).map(toPatientConsent)
  }

  /**
   * Insere uma concessao nova.
   *
   * `clinic_id`, `subject_type`, `subject_id` e `document_version` chegam por
   * parametro ou por constante — nenhum deles e campo de formulario. `granted_at`
   * vai explicito, em ISO, porque a coluna e obrigatoria no schema remoto e o
   * OpenAPI nao expoe DEFAULT (§5 de docs/03-banco-de-dados.md): presumir default
   * seria presumir o que nao esta verificado.
   *
   * `revoked_at: null` tambem vai explicito. E o valor que significa "vigente", e
   * a linha inteira do registro legal fica escrita no insert, sem depender de
   * default de banco.
   *
   * **`ip` e `user_agent` nao sao gravados nesta fatia.** Estao no
   * `recordAuditEvent`, que ja os coleta com a mesma finalidade e sob a mesma RLS.
   * Duplicar dado pessoal em duas tabelas para o mesmo proposito e mais superficie
   * de vazamento sem informacao nova — a pendencia esta declarada em
   * docs/07-cadastro-de-pacientes.md §9.6.
   */
  async grant(
    clinicId: string,
    patientId: string,
    data: GrantPatientConsentData,
  ): Promise<PatientConsent> {
    assertPatientId(patientId)

    const { data: row, error } = await this.client
      .from('consents')
      .insert({
        clinic_id: clinicId,
        subject_type: SUBJECT_TYPE,
        subject_id: patientId,
        purpose: data.purpose,
        document_version: data.documentVersion,
        granted_at: data.grantedAt.toISOString(),
        revoked_at: null,
      })
      .select(CONSENT_COLUMNS)
      .single()

    if (error) throw toPatientWriteError(error)
    if (!row) {
      throw new PatientRepositoryError(
        'unexpected',
        'insert de consentimento nao devolveu linha',
      )
    }

    return toPatientConsent(row as ConsentRow)
  }

  /**
   * Carimba `revoked_at` em todos os registros vigentes da finalidade.
   *
   * O `update` filtra por `revoked_at is null`, entao revogar duas vezes nao
   * reescreve o carimbo da primeira — a segunda chamada simplesmente nao encontra
   * linha e devolve lista vazia. Isso importa: a data da revogacao e parte do
   * registro legal e nao pode ser sobrescrita por um clique repetido.
   */
  async revokeActive(
    clinicId: string,
    patientId: string,
    purpose: PatientConsentPurpose,
    revokedAt: Date,
  ): Promise<PatientConsent[]> {
    assertPatientId(patientId)

    const { data, error } = await this.client
      .from('consents')
      .update({ revoked_at: revokedAt.toISOString() })
      .eq('clinic_id', clinicId)
      .eq('subject_type', SUBJECT_TYPE)
      .eq('subject_id', patientId)
      .eq('purpose', purpose)
      .is('revoked_at', null)
      .select(CONSENT_COLUMNS)

    if (error) throw toPatientWriteError(error)

    return ((data ?? []) as ConsentRow[]).map(toPatientConsent)
  }
}

/**
 * Id fora do formato uuid.
 *
 * Devolve 'not-found', e nao 'validation', porque e o mesmo desfecho de um id de
 * outra clinica: nao ha o que encontrar, e a resposta nao pode ajudar quem esta
 * sondando a distinguir "malformado" de "existe, mas nao e seu".
 */
function assertPatientId(patientId: string): void {
  if (UUID.test(patientId)) return

  // A mensagem nao repete o valor recusado — ela vai para o log do servidor, e o
  // que foi recusado pode ser qualquer coisa que o cliente tenha mandado.
  throw new PatientRepositoryError(
    'not-found',
    'subject_id fora do formato uuid',
  )
}

function toPatientConsent(row: ConsentRow): PatientConsent {
  return {
    id: row.id,
    purpose: toPatientConsentPurpose(row.purpose),
    documentVersion: row.document_version,
    grantedAt: new Date(row.granted_at),
    revokedAt: row.revoked_at ? new Date(row.revoked_at) : null,
  }
}
