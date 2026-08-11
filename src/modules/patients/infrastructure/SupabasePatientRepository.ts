import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database, Json, PatientRow } from '@/lib/supabase/database.types'
import type { Patient } from '@/modules/_shared/domain/types'

import type {
  CpfOwner,
  NewPatientData,
  PatientListQuery,
  PatientMetrics,
  PatientPage,
  PatientRepository,
} from '../domain/PatientRepository'
import { PatientRepositoryError } from '../domain/PatientRepositoryError'
import { PATIENT_PAGE_MAX_SIZE } from '../schemas/patientQuery.schema'
import {
  decodePatientCursor,
  encodePatientCursor,
  patientQueryFingerprint,
} from './patientCursor'
import {
  buildPatientKeysetFilter,
  buildPatientSearchFilter,
  type PatientKeysetAnchor,
} from './patientListFilters'
import { toPatient } from './patientMapper'

type Client = SupabaseClient<Database>

/** Campos mínimos da listagem: nunca transporta CPF ou nota interna. */
/*
 * `social_name` entra na LISTAGEM tambem, e nao so no detalhe: a lista e onde a
 * recepcao encontra a pessoa antes de chamar, e mostrar o nome de registro ali
 * anularia o motivo de a coluna existir. `emergency_contact` fica de fora — a
 * lista nao o exibe, e trazer jsonb por pagina inteira e peso sem uso.
 */
const PATIENT_LIST_COLUMNS =
  'id, full_name, social_name, birth_date, phone, email, is_active, created_at'

/** Campos permitidos no perfil server-side e no retorno de uma escrita. */
const PATIENT_DETAIL_COLUMNS =
  'id, full_name, social_name, birth_date, cpf, cns, address, phone, phone_alt, email, biological_sex, gender_identity, emergency_contact, admin_notes, is_active, created_at'

/**
 * Adapter Supabase.
 *
 * O filtro por clinic_id e explicito mesmo com RLS ativa: e defesa em profundidade.
 * A RLS impede o vazamento; o filtro impede a consulta errada — e mantem a query
 * alinhada ao indice (clinic_id, ...).
 */
export class SupabasePatientRepository implements PatientRepository {
  constructor(private readonly client: Client) {}

  /**
   * Uma pagina da listagem, por KEYSET em `(full_name ASC, id ASC)`.
   *
   * Tres decisoes que valem mais que o codigo:
   *
   *  - **`limit + 1` linhas, nunca `count`.** Saber se ha proxima pagina custa
   *    uma linha a mais; `count: 'exact'` custa um segundo scan da fatia do
   *    tenant a CADA pagina.
   *  - **O cursor e resolvido contra o tenant ativo antes de valer qualquer
   *    coisa.** Ver `resolveKeysetAnchor`.
   *  - **Nunca lanca por cursor.** Cursor ruim serve a primeira pagina, com
   *    `cursorApplied: false` para a tela poder dizer isso em voz alta.
   */
  async listPage(
    clinicId: string,
    query: PatientListQuery,
  ): Promise<PatientPage> {
    // O schema da rota ja clampa. Aqui de novo porque este metodo e publico na
    // porta: o proximo chamador pode nao vir de uma URL validada.
    const limit = Math.min(
      Math.max(Math.trunc(query.limit) || 1, 1),
      PATIENT_PAGE_MAX_SIZE,
    )

    const fingerprint = patientQueryFingerprint(query)
    const anchor = await this.resolveKeysetAnchor(
      clinicId,
      query.cursor,
      fingerprint,
    )

    let builder = this.client
      .from('patients')
      .select(PATIENT_LIST_COLUMNS)
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)

    if (query.status === 'active') {
      builder = builder.eq('is_active', true)
    } else if (query.status === 'inactive') {
      builder = builder.eq('is_active', false)
    }

    // Cada `.or()` vira um parametro `or=` proprio, e o PostgREST os combina com
    // AND. Por isso busca e keyset podem ser dois grupos separados: juntar os
    // dois num `or` so faria o keyset ser ALTERNATIVA da busca, nao restricao.
    const searchFilter = buildPatientSearchFilter(query.search)
    if (searchFilter !== null) builder = builder.or(searchFilter)
    if (anchor !== null) builder = builder.or(buildPatientKeysetFilter(anchor))

    const { data, error } = await builder
      .order('full_name', { ascending: true })
      .order('id', { ascending: true })
      .limit(limit + 1)

    if (error) throw readFailure('listPage', error)

    const rows = (data ?? []) as PatientRow[]
    const hasMore = rows.length > limit
    const pageRows = hasMore ? rows.slice(0, limit) : rows
    const lastRow = pageRows.at(-1)

    const visits = await this.loadVisitDates(
      clinicId,
      pageRows.map((row) => row.id),
    )

    return {
      items: pageRows.map((row) => toPatient(row, visits.get(row.id))),
      hasMore,
      nextCursor:
        hasMore && lastRow
          ? encodePatientCursor(lastRow.id, fingerprint)
          : null,
      cursorApplied: anchor !== null,
    }
  }

  /**
   * Contagens do resumo — tres `head: true`, que devolvem numero sem linha.
   *
   * Nao derivam da pagina de proposito: com paginacao, `items.length` e o
   * tamanho da pagina. "Total: 20" numa clinica de 1.284 pacientes seria uma
   * tela mentindo com naturalidade.
   */
  async countMetrics(
    clinicId: string,
    reference: Date,
  ): Promise<PatientMetrics> {
    const monthStart = new Date(
      reference.getFullYear(),
      reference.getMonth(),
      1,
    )

    const [total, newThisMonth, pendingAppointments] = await Promise.all([
      this.countPatients(clinicId),
      this.countPatients(clinicId, monthStart),
      this.countPendingAppointments(clinicId, reference),
    ])

    return { total, newThisMonth, pendingAppointments }
  }

  private async countPatients(
    clinicId: string,
    createdSince?: Date,
  ): Promise<number> {
    let builder = this.client
      .from('patients')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .is('deleted_at', null)

    if (createdSince) {
      builder = builder.gte('created_at', createdSince.toISOString())
    }

    const { count, error } = await builder

    if (error) throw readFailure('countPatients', error)

    return count ?? 0
  }

  /**
   * Agendamentos futuros nao cancelados, a partir do inicio do dia de
   * referencia. Conta ATENDIMENTOS, nao pacientes — que e o que o card diz.
   */
  private async countPendingAppointments(
    clinicId: string,
    since: Date,
  ): Promise<number> {
    const { count, error } = await this.client
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('clinic_id', clinicId)
      .gte('starts_at', since.toISOString())
      .not('status', 'in', '("canceled","no_show")')

    if (error) throw readFailure('countPendingAppointments', error)

    return count ?? 0
  }

  /**
   * Cursor -> `(full_name, id)` da linha onde a pagina anterior parou.
   *
   * A consulta e o unico ponto em que o cursor ganha significado, e por isso
   * carrega os dois filtros que fecham o tenant: `clinic_id` da sessao e
   * `deleted_at is null`. Um uuid de paciente de outra clinica nao acha linha
   * (filtro explicito + RLS) e devolve `null` — primeira pagina do proprio
   * tenant, sem erro e sem vazamento.
   *
   * Falha de rede aqui tambem devolve `null`: uma pagina do inicio e melhor
   * resposta que um 500 por causa de um ponteiro de navegacao.
   */
  private async resolveKeysetAnchor(
    clinicId: string,
    cursor: string | null,
    fingerprint: string,
  ): Promise<PatientKeysetAnchor | null> {
    const decoded = decodePatientCursor(cursor)
    if (decoded === null) return null

    // Cursor de outro recorte de filtro: aplicado aqui, saltaria linhas em
    // silencio e o usuario veria uma lista plausivel comecando no meio.
    if (decoded.f !== fingerprint) return null

    const { data, error } = await this.client
      .from('patients')
      .select('id, full_name')
      .eq('clinic_id', clinicId)
      .eq('id', decoded.a)
      .is('deleted_at', null)
      .maybeSingle()

    if (error) {
      console.error('[patients] resolveKeysetAnchor', {
        code: error.code ?? null,
        message: error.message ?? null,
      })
      return null
    }

    if (!data) return null

    return { id: data.id, fullName: data.full_name }
  }

  async findById(
    clinicId: string,
    patientId: string,
  ): Promise<Patient | null> {
    const { data, error } = await this.client
      .from('patients')
      .select(PATIENT_DETAIL_COLUMNS)
      .eq('clinic_id', clinicId)
      .eq('id', patientId)
      .is('deleted_at', null)
      .maybeSingle()

    if (error) throw readFailure('findById', error)

    if (!data) return null

    const visits = await this.loadVisitDates(clinicId, [patientId])

    return toPatient(data as PatientRow, visits.get(patientId))
  }

  /**
   * Insere o paciente na clinica ativa.
   *
   * `clinic_id` e `created_by` chegam por parametro, do `ActionContext` — nunca do
   * formulario. A RLS ainda recusaria a clinica errada, mas a assinatura ja tira a
   * tentacao de aceita-los do cliente (P3 de docs/01-arquitetura.md).
   *
   * Os valores fixos sao os que o schema remoto exige e o formulario nao coleta:
   *
   *  - `address: {}` — a coluna e `jsonb` NOT NULL; objeto vazio e "sem endereco",
   *    nao um endereco falso. Endereco pertence ao grupo documental, que sai com
   *    o faturamento.
   *  - `is_active: true` — cadastro novo entra ativo. Arquivar e outra fatia.
   *
   * Nenhum default de banco e presumido: o que a coluna exige, o insert manda.
   */
  async create(
    clinicId: string,
    data: NewPatientData,
    createdBy: string,
  ): Promise<Patient> {
    const { data: row, error } = await this.client
      .from('patients')
      .insert({
        clinic_id: clinicId,
        full_name: data.fullName,
        social_name: data.socialName,
        birth_date: data.birthDate,
        biological_sex: data.biologicalSex,
        gender_identity: data.genderIdentity,
        phone: data.phone,
        phone_alt: data.phoneAlt,
        email: data.email,
        cpf: data.cpf,
        cns: data.cns,
        /*
         * Sem endereco a coluna recebe `{}`, e nao `null`: ela e NOT NULL, e
         * objeto vazio e "sem endereco" — nao endereco falso.
         */
        address: (data.address ?? {}) as unknown as Json,
        /*
         * `as unknown as Json` e a mesma travessia de `workflows.trigger_config`:
         * o tipo do dominio e fechado, e `Json` do supabase-js exige assinatura
         * de indice. A forma ja foi validada pelo schema antes de chegar aqui.
         */
        emergency_contact: data.emergencyContact as unknown as Json,
        admin_notes: data.adminNotes,
        is_active: true,
        created_by: createdBy,
      })
      .select(PATIENT_DETAIL_COLUMNS)
      .single()

    if (error) throw toWriteError(error)

    // Paciente recem-criado nao tem atendimento: nao ha visita a consultar, e uma
    // consulta a `appointments` aqui seria uma ida de rede para receber vazio.
    return toPatient(row as PatientRow)
  }

  /**
   * Atualiza o cadastro.
   *
   * `clinic_id` no `where` e defesa em profundidade: a RLS ja recusaria a linha de
   * outra clinica, e o filtro garante que a recusa vire "nao encontrado" em vez de
   * "atualizou zero linhas em silencio".
   *
   * `updated_at` vai explicito porque nao foi possivel confirmar se existe trigger
   * na tabela (P-P3 de docs/07-cadastro-de-pacientes.md). Se existir, o banco
   * sobrescreve — nao ha conflito.
   */
  async update(
    clinicId: string,
    patientId: string,
    data: NewPatientData,
  ): Promise<Patient> {
    const { data: row, error } = await this.client
      .from('patients')
      .update({
        full_name: data.fullName,
        social_name: data.socialName,
        birth_date: data.birthDate,
        biological_sex: data.biologicalSex,
        gender_identity: data.genderIdentity,
        phone: data.phone,
        phone_alt: data.phoneAlt,
        email: data.email,
        cpf: data.cpf,
        cns: data.cns,
        address: (data.address ?? {}) as unknown as Json,
        /*
         * `as unknown as Json` e a mesma travessia de `workflows.trigger_config`:
         * o tipo do dominio e fechado, e `Json` do supabase-js exige assinatura
         * de indice. A forma ja foi validada pelo schema antes de chegar aqui.
         */
        emergency_contact: data.emergencyContact as unknown as Json,
        admin_notes: data.adminNotes,
        updated_at: new Date().toISOString(),
      })
      .eq('clinic_id', clinicId)
      .eq('id', patientId)
      .is('deleted_at', null)
      .select(PATIENT_DETAIL_COLUMNS)
      .maybeSingle()

    if (error) throw toWriteError(error)
    if (!row) throw notFound(patientId)

    const visits = await this.loadVisitDates(clinicId, [patientId])

    return toPatient(row as PatientRow, visits.get(patientId))
  }

  /**
   * O CPF já é de outro paciente desta clínica?
   *
   * `deleted_at is null` entra no `WHERE`: cadastro removido por fora do produto
   * não pode bloquear o CPF de quem está no balcão. Arquivado, sim — `is_active`
   * fica de fora de propósito, porque paciente arquivado continua sendo a mesma
   * pessoa e o caminho certo é reativá-lo, não criar um segundo cadastro.
   *
   * `neq('id', ...)` só entra quando há um id a excluir: na edição, o próprio
   * paciente não é conflito consigo mesmo.
   */
  async findCpfOwner(
    clinicId: string,
    cpf: string,
    exceptPatientId: string | null,
  ): Promise<CpfOwner | null> {
    let query = this.client
      .from('patients')
      .select('id, full_name, social_name')
      .eq('clinic_id', clinicId)
      .eq('cpf', cpf)
      .is('deleted_at', null)
      .limit(1)

    if (exceptPatientId) query = query.neq('id', exceptPatientId)

    const { data, error } = await query.maybeSingle()

    if (error) throw toWriteError(error)
    if (!data) return null

    // O nome SOCIAL vence, como em toda exibicao: a mensagem de conflito e lida
    // por quem vai procurar essa pessoa na listagem, que a mostra pelo social.
    return { id: data.id, name: data.social_name ?? data.full_name }
  }

  async setArchived(
    clinicId: string,
    patientId: string,
    archived: boolean,
  ): Promise<Patient> {
    const { data: row, error } = await this.client
      .from('patients')
      .update({ is_active: !archived, updated_at: new Date().toISOString() })
      .eq('clinic_id', clinicId)
      .eq('id', patientId)
      .is('deleted_at', null)
      .select(PATIENT_DETAIL_COLUMNS)
      .maybeSingle()

    if (error) throw toWriteError(error)
    if (!row) throw notFound(patientId)

    const visits = await this.loadVisitDates(clinicId, [patientId])

    return toPatient(row as PatientRow, visits.get(patientId))
  }

  /**
   * Ultima e proxima visita de cada paciente, em uma consulta so.
   * Evita o N+1 que sairia de buscar as datas paciente a paciente.
   *
   * **Recebe no maximo os ids DA PAGINA** (<= `PATIENT_PAGE_MAX_SIZE`). Antes de
   * P-02a recebia a clinica inteira, e o `in(...)` crescia dentro da URL do
   * PostgREST ate estourar em HTTP 414 — algumas centenas de pacientes bastavam.
   *
   * Continua trazendo o historico completo desses pacientes, o que e aceitavel
   * em 50 linhas. A forma correta (`last_visit_at` denormalizado, ou view) e
   * migration, portanto P-02b.
   */
  private async loadVisitDates(
    clinicId: string,
    patientIds: readonly string[],
  ): Promise<Map<string, { lastVisitAt: Date | null; nextVisitAt: Date | null }>> {
    const result = new Map<
      string,
      { lastVisitAt: Date | null; nextVisitAt: Date | null }
    >()

    if (patientIds.length === 0) return result

    const { data, error } = await this.client
      .from('appointments')
      .select('patient_id, starts_at, status')
      .eq('clinic_id', clinicId)
      .in('patient_id', [...patientIds])
      .not('status', 'in', '("canceled","no_show")')
      .order('starts_at', { ascending: true })

    if (error) throw readFailure('loadVisitDates', error)

    const now = Date.now()

    for (const row of data ?? []) {
      const startsAt = new Date(row.starts_at)
      const current = result.get(row.patient_id) ?? {
        lastVisitAt: null,
        nextVisitAt: null,
      }

      if (startsAt.getTime() < now) {
        // Ordenacao ascendente: a ultima passada sobrescreve ate sobrar a mais recente.
        current.lastVisitAt = startsAt
      } else if (current.nextVisitAt === null) {
        // Primeira futura encontrada e a proxima.
        current.nextVisitAt = startsAt
      }

      result.set(row.patient_id, current)
    }

    return result
  }
}

/**
 * Falha de LEITURA -> erro generico na tela, causa so no log do servidor.
 *
 * A mensagem do Postgres nao pode subir para o boundary de erro: em dev ela
 * aparece na tela, e nome de coluna, nome de policy e SQLSTATE sao mapa da
 * estrutura interna. O `error.tsx` da rota ja mostra a copy correta ao usuario;
 * o que falta e nao empurrar detalhe junto.
 *
 * Mesmo padrao do `toWriteError`, com uma diferenca: leitura nao tem vocabulario
 * de dominio (nao ha "conflito" ao listar), entao sai um `Error` cru.
 */
function readFailure(
  context: string,
  error: { code?: string | null; message?: string | null },
): Error {
  console.error(`[patients] ${context}`, {
    code: error.code ?? null,
    message: error.message ?? null,
  })

  return new Error('Falha ao carregar os dados de pacientes.')
}

/**
 * Zero linhas afetadas.
 *
 * Pode ser id inexistente, paciente ja excluido, ou paciente de OUTRA clinica —
 * a RLS filtra antes de o `update` ver a linha. As tres situacoes devolvem a
 * mesma coisa de proposito: distinguir "nao existe" de "existe, mas nao e seu"
 * entregaria ao chamador a informacao de que aquele id existe em algum tenant.
 */
function notFound(patientId: string): PatientRepositoryError {
  return new PatientRepositoryError(
    'not-found',
    `nenhuma linha afetada para o paciente ${patientId} na clinica ativa`,
  )
}

/**
 * Traduz a recusa do Postgres para o vocabulario do dominio.
 *
 * A mensagem que sobe daqui e para o LOG DO SERVIDOR — a action nunca a repassa
 * para a tela. `code` e o SQLSTATE, unico dado do erro que a action registra.
 */
function toWriteError(error: {
  code?: string | null
  message?: string | null
}): PatientRepositoryError {
  const code = error.code ?? undefined
  const message = error.message ?? 'sem mensagem'

  // 23505 = unique_violation. Hoje nenhuma coluna que este insert preenche e
  // unica no schema conhecido, mas indices unicos entram sem aviso — e o usuario
  // precisa de uma mensagem melhor que "erro inesperado" se um entrar.
  if (code === '23505') {
    return new PatientRepositoryError('conflict', message, code)
  }

  // 42501 = insufficient_privilege (policy recusou); PGRST301 = JWT invalido.
  if (code === '42501' || code === 'PGRST301') {
    return new PatientRepositoryError('forbidden', message, code)
  }

  // O supabase-js embrulha falha de rede em erro sem SQLSTATE. Sem codigo e sem
  // resposta do banco, o que houve foi indisponibilidade, nao recusa.
  if (!code && /fetch|network|timeout|econnre/i.test(message)) {
    return new PatientRepositoryError('unavailable', message)
  }

  return new PatientRepositoryError('unexpected', message, code)
}
