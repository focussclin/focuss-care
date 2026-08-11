import 'server-only'

import { createHash } from 'node:crypto'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import type {
  MedicalRecord,
  RecordEncounter,
  RecordEncounterStatus,
  RecordType,
} from '../domain/MedicalRecord'
import type {
  MedicalRecordRepository,
  NewRecordData,
} from '../domain/MedicalRecordRepository'
import { MedicalRecordRepositoryError } from '../domain/MedicalRecordRepositoryError'

type Client = SupabaseClient<Database>

/**
 * Colunas do prontuário que a aplicação lê.
 *
 * `signature` e `content` (o jsonb bruto) ficam de fora: a tela mostra
 * `content_text`, e trazer o jsonb junto duplicaria o dado clínico no payload
 * sem nenhum uso.
 */
const RECORD_COLUMNS =
  'id, patient_id, encounter_id, author_id, record_type, content_text, version, supersedes_id, signed_at, created_at'

interface RecordRow {
  id: string | null
  patient_id: string | null
  encounter_id: string | null
  author_id: string | null
  record_type: RecordType | null
  content_text: string | null
  version: number | null
  supersedes_id: string | null
  signed_at: string | null
  created_at: string | null
}

/**
 * Colunas do atendimento que o prontuário lê.
 *
 * `appointment_id`, `created_by` e `updated_at` ficam de fora: são vocabulário
 * de agenda e de operação, e o prontuário não os mostra em lugar nenhum. O nome
 * do profissional vem por embed porque `encounters` **declara** a FK — ao
 * contrário da view do prontuário, que não declara nenhuma.
 */
const ENCOUNTER_COLUMNS =
  'id, status, started_at, ended_at, chief_complaint, professional:professionals ( display_name )'

interface EncounterRow {
  id: string | null
  status: RecordEncounterStatus | null
  started_at: string | null
  ended_at: string | null
  chief_complaint: string | null
  professional: { display_name: string | null } | null
}

function toRecordEncounter(row: EncounterRow): RecordEncounter | null {
  // Sem id ou sem início não há atendimento a que vincular coisa alguma.
  if (!row.id || !row.started_at) return null

  return {
    id: row.id,
    status: row.status ?? 'open',
    startedAt: new Date(row.started_at),
    endedAt: row.ended_at ? new Date(row.ended_at) : null,
    professionalName: row.professional?.display_name ?? null,
    chiefComplaint: row.chief_complaint,
  }
}

/**
 * Hash do conteúdo.
 *
 * `content_hash` é NOT NULL no schema e existe para integridade: dois registros
 * com o mesmo texto têm o mesmo hash, e alterar o texto sem alterar o hash fica
 * detectável.
 *
 * **Pendência honesta:** não foi possível verificar se o banco tem trigger ou
 * check que espere um algoritmo específico (bloqueio B1 — sem acesso SQL).
 * sha256 hex do texto canônico é a escolha padrão; se o banco esperar outra, o
 * insert é recusado de imediato — falha ruidosa, não silenciosa.
 */
function contentHash(content: string): string {
  return createHash('sha256').update(content.trim(), 'utf8').digest('hex')
}

function toMedicalRecord(
  row: RecordRow,
  authorNames: Map<string, string>,
  encounters: Map<string, RecordEncounter> = new Map(),
): MedicalRecord | null {
  // As colunas da view são todas nullable no tipo gerado. Uma linha sem id ou
  // sem paciente não é um registro — descartar é mais honesto que inventar.
  if (!row.id || !row.patient_id || !row.author_id || !row.created_at) {
    return null
  }

  return {
    id: row.id,
    patientId: row.patient_id,
    encounterId: row.encounter_id,
    // Ausente NÃO é "sem vínculo": `encounterId` continua dizendo que há um.
    encounter: row.encounter_id
      ? (encounters.get(row.encounter_id) ?? null)
      : null,
    authorId: row.author_id,
    authorName: authorNames.get(row.author_id) ?? 'Profissional',
    recordType: row.record_type ?? 'note',
    content: row.content_text ?? '',
    version: row.version ?? 1,
    supersedesId: row.supersedes_id,
    signedAt: row.signed_at ? new Date(row.signed_at) : null,
    createdAt: new Date(row.created_at),
  }
}

/**
 * Adapter Supabase do prontuário.
 *
 * Toda consulta filtra `clinic_id` explicitamente, mesmo com RLS ativa e mesmo
 * com `can_access_clinical()` no caminho. Defesa em profundidade: a RLS impede
 * o vazamento, o filtro impede a consulta errada.
 */
export class SupabaseMedicalRecordRepository
  implements MedicalRecordRepository
{
  constructor(private readonly client: Client) {}

  async listCurrentByPatient(
    clinicId: string,
    patientId: string,
    limit: number,
  ): Promise<MedicalRecord[]> {
    const { data, error } = await this.client
      .from('v_medical_records_current')
      .select(RECORD_COLUMNS)
      .eq('clinic_id', clinicId)
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw readFailure('listCurrentByPatient', error)

    return this.hydrate(clinicId, (data ?? []) as RecordRow[])
  }

  async listRecent(clinicId: string, limit: number): Promise<MedicalRecord[]> {
    const { data, error } = await this.client
      .from('v_medical_records_current')
      .select(RECORD_COLUMNS)
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) throw readFailure('listRecent', error)

    return this.hydrate(clinicId, (data ?? []) as RecordRow[])
  }

  /**
   * Atendimentos aos quais uma evolução pode ser vinculada.
   *
   * `neq('status', 'canceled')` vai no `WHERE`, e não num filtro depois da
   * leitura: o teto de linhas é aplicado pelo banco, e filtrar em memória faria
   * um paciente com muitos cancelamentos devolver uma lista curta demais.
   */
  async listPatientEncounters(
    clinicId: string,
    patientId: string,
    limit: number,
  ): Promise<RecordEncounter[]> {
    const { data, error } = await this.client
      .from('encounters')
      .select(ENCOUNTER_COLUMNS)
      .eq('clinic_id', clinicId)
      .eq('patient_id', patientId)
      .neq('status', 'canceled')
      .order('started_at', { ascending: false })
      .limit(limit)

    if (error) throw readFailure('listPatientEncounters', error)

    return ((data ?? []) as unknown as EncounterRow[])
      .map(toRecordEncounter)
      .filter((encounter): encounter is RecordEncounter => encounter !== null)
  }

  /**
   * Conferência de pertinência — os TRÊS filtros no mesmo `WHERE`.
   *
   * Ler o atendimento e comparar em memória daria o mesmo resultado e uma
   * armadilha: bastaria alguém esquecer uma das comparações para o vínculo
   * atravessar a fronteira do inquilino sem que nada reclamasse.
   */
  async encounterBelongsTo(
    clinicId: string,
    encounterId: string,
    patientId: string,
  ): Promise<boolean> {
    const { data, error } = await this.client
      .from('encounters')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('id', encounterId)
      .eq('patient_id', patientId)
      .maybeSingle()

    if (error) throw toWriteError(error)

    return data !== null
  }

  /**
   * A cadeia de versões, da mais nova para a mais antiga.
   *
   * Segue `supersedes_id` a partir do id pedido. O laço tem teto: uma cadeia
   * corrompida (ciclo) travaria o request, e um prontuário com centenas de
   * correções é caso de investigação, não de listagem.
   */
  async listVersions(
    clinicId: string,
    recordId: string,
  ): Promise<MedicalRecord[]> {
    const MAX_VERSIONS = 50
    const rows: RecordRow[] = []
    const seen = new Set<string>()
    let cursor: string | null = recordId

    while (cursor && rows.length < MAX_VERSIONS && !seen.has(cursor)) {
      seen.add(cursor)

      const { data, error } = await this.client
        .from('medical_records')
        .select(RECORD_COLUMNS)
        .eq('clinic_id', clinicId)
        .eq('id', cursor)
        .maybeSingle()

      if (error) throw readFailure('listVersions', error)
      if (!data) break

      const row = data as RecordRow
      rows.push(row)
      cursor = row.supersedes_id
    }

    return this.hydrate(clinicId, rows)
  }

  async create(
    clinicId: string,
    data: NewRecordData,
    authorId: string,
    authorUserId: string,
  ): Promise<MedicalRecord> {
    const { data: row, error } = await this.client
      .from('medical_records')
      .insert({
        clinic_id: clinicId,
        patient_id: data.patientId,
        encounter_id: data.encounterId,
        author_id: authorId,
        author_user_id: authorUserId,
        record_type: data.recordType,
        // `content` é jsonb e `content_text` é a forma legível. Guardar os dois
        // com a mesma origem impede que divirjam — o dia em que o formulário
        // ficar estruturado, `content` cresce e `content_text` continua sendo o
        // que a tela e a busca leem.
        content: { text: data.content },
        content_text: data.content,
        content_hash: contentHash(data.content),
        version: 1,
        supersedes_id: null,
      })
      .select(RECORD_COLUMNS)
      .single()

    if (error) throw toWriteError(error)

    const record = toMedicalRecord(row as RecordRow, new Map())
    if (!record) throw unexpectedShape()

    return record
  }

  /**
   * Corrige criando a versão seguinte. **Nunca faz `update`.**
   *
   * A linha anterior é lida para herdar paciente, atendimento e tipo — corrigir
   * o texto não pode, por acidente, mudar de quem é o registro.
   *
   * O `is('supersedes_id', null)` da checagem seguinte é a guarda de
   * concorrência: se outra pessoa já corrigiu esta versão, a segunda correção
   * criaria um ramo paralelo na cadeia, e o prontuário passaria a ter duas
   * "últimas versões".
   */
  async amend(
    clinicId: string,
    recordId: string,
    content: string,
    authorId: string,
    authorUserId: string,
  ): Promise<MedicalRecord> {
    const { data: previous, error: readError } = await this.client
      .from('medical_records')
      .select('id, patient_id, encounter_id, record_type, version')
      .eq('clinic_id', clinicId)
      .eq('id', recordId)
      .maybeSingle()

    if (readError) throw toWriteError(readError)
    if (!previous) throw notFound(recordId)

    // Já existe versão apontando para esta? Então esta não é a ponta da cadeia.
    const { data: successor, error: successorError } = await this.client
      .from('medical_records')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('supersedes_id', recordId)
      .limit(1)
      .maybeSingle()

    if (successorError) throw toWriteError(successorError)

    if (successor) {
      throw new MedicalRecordRepositoryError(
        'superseded',
        `registro ${recordId} ja foi corrigido por ${successor.id}`,
      )
    }

    const { data: row, error } = await this.client
      .from('medical_records')
      .insert({
        clinic_id: clinicId,
        patient_id: previous.patient_id,
        encounter_id: previous.encounter_id,
        author_id: authorId,
        author_user_id: authorUserId,
        record_type: previous.record_type,
        content: { text: content },
        content_text: content,
        content_hash: contentHash(content),
        version: (previous.version ?? 1) + 1,
        supersedes_id: recordId,
      })
      .select(RECORD_COLUMNS)
      .single()

    if (error) throw toWriteError(error)

    const record = toMedicalRecord(row as RecordRow, new Map())
    if (!record) throw unexpectedShape()

    return record
  }

  /**
   * Auditoria de LEITURA.
   *
   * Best-effort: falhar aqui não pode impedir um profissional de ver o
   * prontuário do paciente que está na frente dele. O sinal fica no log.
   *
   * **Pendência declarada:** o banco tem uma função própria para isto,
   * `log_clinical_access()`, mas o gerador de tipos não conseguiu inferir a
   * assinatura dela (`Args: Record<string, unknown>`), e chamar uma RPC com
   * nomes de parâmetro adivinhados falharia em toda leitura. Enquanto a
   * assinatura não for legível (bloqueio B1), o registro vai por
   * `recordAuditEvent`, que é o mesmo caminho do resto do produto.
   *
   * Vale lembrar que hoje NENHUM evento persiste: a policy de `INSERT` de
   * `audit_log` recusa o membro autenticado (P-P6). A migration está proposta.
   */
  async logAccess(
    clinicId: string,
    patientId: string | null,
  ): Promise<void> {
    const { recordAuditEvent } = await import('@/lib/audit/audit-log')

    await recordAuditEvent(
      {
        action: 'record.read',
        entityType: 'patient',
        entityId: patientId,
        // Nenhum conteúdo clínico entra no evento — só o fato de ter havido
        // acesso. O "o quê" está no prontuário; aqui fica o "quem, quando".
        // `target` distingue a leitura da lista da de um paciente — o
        // `entity_id` nulo sozinho nao diria qual das duas foi.
        after: {
          scope: 'medical_records',
          target: patientId ? 'patient' : 'list',
        },
      },
      { client: this.client },
    )

    void clinicId
  }

  /**
   * Autor e atendimento de cada linha — duas consultas, nunca N.
   *
   * A view não declara relacionamento (`Relationships: []`), então não há join
   * embutido: o PostgREST não consegue trazer nem o nome nem o atendimento
   * junto. Duas consultas extras, limitadas ao que a página já leu, são mais
   * baratas que o N+1 que sairia de buscar linha a linha.
   *
   * As duas são **best-effort e paralelas**: nenhuma delas é o registro clínico
   * em si. Se falharem, o prontuário continua legível — com o autor como
   * "Profissional" e o vínculo sem detalhe. Derrubar a leitura por causa de um
   * rótulo seria trocar um problema de exibição por um de cuidado.
   */
  private async hydrate(
    clinicId: string,
    rows: RecordRow[],
  ): Promise<MedicalRecord[]> {
    const authorIds = [
      ...new Set(rows.map((row) => row.author_id).filter((id): id is string => !!id)),
    ]
    const encounterIds = [
      ...new Set(
        rows.map((row) => row.encounter_id).filter((id): id is string => !!id),
      ),
    ]

    const [names, encounters] = await Promise.all([
      this.authorNames(clinicId, authorIds),
      this.encountersById(clinicId, encounterIds),
    ])

    return rows
      .map((row) => toMedicalRecord(row, names, encounters))
      .filter((record): record is MedicalRecord => record !== null)
  }

  private async authorNames(
    clinicId: string,
    authorIds: readonly string[],
  ): Promise<Map<string, string>> {
    const names = new Map<string, string>()
    if (authorIds.length === 0) return names

    const { data, error } = await this.client
      .from('professionals')
      .select('id, display_name')
      .eq('clinic_id', clinicId)
      .in('id', authorIds)

    if (error) {
      console.error('[records] authorNames', {
        code: error.code ?? null,
        message: error.message ?? null,
      })
    }

    for (const row of data ?? []) {
      names.set(row.id, row.display_name)
    }

    return names
  }

  /**
   * Contexto dos atendimentos citados pela página.
   *
   * O `clinic_id` continua no filtro mesmo com os ids vindos das próprias
   * linhas já lidas: é a mesma defesa em profundidade do resto do adapter, e
   * custa um predicado.
   */
  private async encountersById(
    clinicId: string,
    encounterIds: readonly string[],
  ): Promise<Map<string, RecordEncounter>> {
    const encounters = new Map<string, RecordEncounter>()
    if (encounterIds.length === 0) return encounters

    const { data, error } = await this.client
      .from('encounters')
      .select(ENCOUNTER_COLUMNS)
      .eq('clinic_id', clinicId)
      .in('id', encounterIds)

    if (error) {
      console.error('[records] encountersById', {
        code: error.code ?? null,
        message: error.message ?? null,
      })
    }

    for (const row of (data ?? []) as unknown as EncounterRow[]) {
      const encounter = toRecordEncounter(row)
      if (encounter) encounters.set(encounter.id, encounter)
    }

    return encounters
  }
}

function notFound(recordId: string): MedicalRecordRepositoryError {
  return new MedicalRecordRepositoryError(
    'not-found',
    `nenhum registro ${recordId} na clinica ativa`,
  )
}

function unexpectedShape(): MedicalRecordRepositoryError {
  return new MedicalRecordRepositoryError(
    'unexpected',
    'linha devolvida sem os campos obrigatorios do prontuario',
  )
}

/**
 * Traduz a recusa de uma LEITURA.
 *
 * Antes devolvia um `Error` genérico, e isso bastava enquanto o único chamador
 * era `/prontuarios` — uma rota inteira dedicada ao prontuário pode simplesmente
 * derrubar o render e mostrar a tela de erro. A ficha do paciente não pode: o
 * prontuário é **um painel entre dez**, e um `throw` ali levaria embora cadastro,
 * contatos, agenda e consentimentos por causa de uma consulta clínica recusada.
 *
 * Para o painel decidir entre "você não tem acesso" e "o servidor não respondeu"
 * sem adivinhar, a falha precisa carregar a CLASSE. Só ela: a mensagem do
 * Postgres continua parando no log do servidor, pela mesma razão de
 * `toWriteError` — o texto pode ecoar o valor consultado, e aqui o valor inclui
 * conteúdo clínico.
 */
function readFailure(
  context: string,
  error: { code?: string | null; message?: string | null },
): MedicalRecordRepositoryError {
  const code = error.code ?? undefined
  const message = error.message ?? 'sem mensagem'

  console.error(`[records] ${context}`, {
    code: code ?? null,
    message,
  })

  if (code === '42501' || code === 'PGRST301') {
    return new MedicalRecordRepositoryError(
      'forbidden',
      `leitura recusada em ${context}`,
      code,
    )
  }

  if (!code && /fetch|network|timeout|econnre/i.test(message)) {
    return new MedicalRecordRepositoryError(
      'unavailable',
      `sem resposta em ${context}`,
    )
  }

  return new MedicalRecordRepositoryError(
    'unexpected',
    `falha de leitura em ${context}`,
    code,
  )
}

/**
 * Traduz a recusa do Postgres.
 *
 * **A mensagem NÃO é repassada adiante em nenhum caso.** Em `medical_records` o
 * texto do erro pode ecoar o valor enviado — e o valor enviado é conteúdo
 * clínico. Só `reason` e `code` viajam.
 */
function toWriteError(error: {
  code?: string | null
  message?: string | null
}): MedicalRecordRepositoryError {
  const code = error.code ?? undefined
  const message = error.message ?? 'sem mensagem'

  // 23503 = foreign_key_violation: paciente, atendimento ou profissional que
  // não existe nesta clínica.
  if (code === '23503') {
    return new MedicalRecordRepositoryError('not-found', message, code)
  }

  if (code === '42501' || code === 'PGRST301') {
    return new MedicalRecordRepositoryError('forbidden', message, code)
  }

  if (!code && /fetch|network|timeout|econnre/i.test(message)) {
    return new MedicalRecordRepositoryError('unavailable', message)
  }

  return new MedicalRecordRepositoryError('unexpected', message, code)
}
