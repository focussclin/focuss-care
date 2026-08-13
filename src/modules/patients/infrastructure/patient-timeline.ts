import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import {
  orderPatientEvents,
  type PatientEvent,
  type PatientEventKind,
} from '../domain/PatientTimeline'

/**
 * Monta a linha do tempo do paciente a partir das fontes que já existem.
 *
 * # Nenhuma tabela nova
 *
 * A alternativa seria uma `patient_events` alimentada por trigger — mais rápida
 * de ler e uma segunda verdade para divergir da primeira. Enquanto a ficha
 * carrega seis consultas em paralelo sem esforço, ler das fontes mantém a
 * timeline correta por construção: ela não pode discordar dos painéis porque lê
 * as mesmas linhas.
 *
 * # Cada fonte é opcional e independente
 *
 * Uma consulta que falha vira lista vazia daquele tipo, não erro da timeline. É
 * o mesmo princípio do resto da ficha: um painel que não carrega não pode
 * derrubar os outros sete.
 */

/** Teto por fonte. A ficha mostra história recente, não o arquivo inteiro. */
const PER_SOURCE_LIMIT = 25

/**
 * A porta que a ROTA usa: resolve a fonte de dados e devolve os eventos.
 *
 * Existe para a rota não precisar do `SupabaseClient` — nenhuma das outras
 * factories do módulo o expõe, e abrir uma exceção aqui espalharia o cliente do
 * banco para dentro de `app/`, que é justamente o que as factories evitam.
 *
 * Fora do modo Supabase devolve lista vazia: a demonstração não tem história, e
 * inventar uma faria a ficha de exemplo parecer um prontuário real.
 */
export async function getPatientTimeline(
  patientId: string,
  kinds: readonly PatientEventKind[],
): Promise<PatientEvent[]> {
  if (kinds.length === 0) return []

  const { resolveDataSource } = await import('@/lib/data-source')
  const source = await resolveDataSource()

  if (source.mode !== 'supabase') return []

  return loadPatientTimeline(source.client, source.clinicId, patientId, kinds)
}

export async function loadPatientTimeline(
  client: SupabaseClient<Database>,
  clinicId: string,
  patientId: string,
  kinds: readonly PatientEventKind[],
): Promise<PatientEvent[]> {
  const wants = (kind: PatientEventKind) => kinds.includes(kind)

  const [appointments, encounters, records, prescriptions, vitals, documents] =
    await Promise.all([
      wants('appointment') ? loadAppointments(client, clinicId, patientId) : [],
      wants('encounter') ? loadEncounters(client, clinicId, patientId, wants('record')) : [],
      wants('record') ? loadRecords(client, clinicId, patientId) : [],
      wants('prescription') ? loadPrescriptions(client, clinicId, patientId) : [],
      wants('vitals') ? loadVitals(client, clinicId, patientId) : [],
      wants('document') ? loadDocuments(client, clinicId, patientId) : [],
    ])

  return orderPatientEvents([
    ...appointments,
    ...encounters,
    ...records,
    ...prescriptions,
    ...vitals,
    ...documents,
  ])
}

const appointmentTitles: Record<string, string> = {
  scheduled: 'Consulta agendada',
  confirmed: 'Consulta confirmada',
  checked_in: 'Chegada registrada',
  in_progress: 'Consulta em andamento',
  completed: 'Consulta realizada',
  canceled: 'Consulta cancelada',
  no_show: 'Falta registrada',
}

async function loadAppointments(
  client: SupabaseClient<Database>,
  clinicId: string,
  patientId: string,
): Promise<PatientEvent[]> {
  const { data, error } = await client
    .from('appointments')
    .select('id, starts_at, status, reason, professionals ( display_name )')
    .eq('clinic_id', clinicId)
    .eq('patient_id', patientId)
    .order('starts_at', { ascending: false })
    .limit(PER_SOURCE_LIMIT)

  if (error) return failed('appointments', error)

  return (data ?? []).map((row) => ({
    id: `appointment:${row.id}`,
    kind: 'appointment' as const,
    occurredAt: new Date(row.starts_at),
    title: appointmentTitles[row.status] ?? 'Consulta',
    /*
     * `reason` é o motivo do AGENDAMENTO, anotado na marcação — não é queixa
     * clínica, e por isso acompanha o evento que a recepção também vê.
     */
    detail: row.reason,
    actor: professionalName(row.professionals),
  }))
}

async function loadEncounters(
  client: SupabaseClient<Database>,
  clinicId: string,
  patientId: string,
  canSeeComplaint: boolean,
): Promise<PatientEvent[]> {
  const { data, error } = await client
    .from('encounters')
    .select('id, started_at, status, chief_complaint, professionals ( display_name )')
    .eq('clinic_id', clinicId)
    .eq('patient_id', patientId)
    .order('started_at', { ascending: false })
    .limit(PER_SOURCE_LIMIT)

  if (error) return failed('encounters', error)

  return (data ?? []).map((row) => ({
    id: `encounter:${row.id}`,
    kind: 'encounter' as const,
    occurredAt: new Date(row.started_at),
    title: row.status === 'canceled' ? 'Atendimento cancelado' : 'Atendimento',
    /*
     * A queixa é registro clínico e some para quem não tem `record.read` — a
     * mesma regra que `toEncounterDto` aplica em `/atendimentos`. Sem isto, a
     * timeline seria a porta lateral para o que aquela tela protege.
     */
    detail: canSeeComplaint ? row.chief_complaint : null,
    actor: professionalName(row.professionals),
  }))
}

const recordTitles: Record<string, string> = {
  anamnesis: 'Anamnese',
  evolution: 'Evolução clínica',
  physical_exam: 'Exame físico',
  diagnosis: 'Diagnóstico',
  procedure: 'Procedimento',
  exam_request: 'Pedido de exame',
  referral: 'Encaminhamento',
  certificate: 'Atestado',
  note: 'Nota',
}

async function loadRecords(
  client: SupabaseClient<Database>,
  clinicId: string,
  patientId: string,
): Promise<PatientEvent[]> {
  const { data, error } = await client
    .from('v_medical_records_current')
    .select('id, created_at, record_type, version')
    .eq('clinic_id', clinicId)
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
    .limit(PER_SOURCE_LIMIT)

  if (error) return failed('records', error)

  return (data ?? []).flatMap((row) =>
    row.id && row.created_at
      ? [
          {
            id: `record:${row.id}`,
            kind: 'record' as const,
            occurredAt: new Date(row.created_at),
            title: recordTitles[row.record_type ?? 'note'] ?? 'Registro',
            /*
             * O TEXTO do registro não entra na timeline — só o tipo e a versão.
             * A linha do tempo é índice; o conteúdo clínico continua no painel
             * do prontuário, sob a leitura auditada que ele já faz.
             */
            detail:
              row.version && row.version > 1 ? `Versão ${row.version}` : null,
            actor: null,
          },
        ]
      : [],
  )
}

async function loadPrescriptions(
  client: SupabaseClient<Database>,
  clinicId: string,
  patientId: string,
): Promise<PatientEvent[]> {
  const { data, error } = await client
    .from('prescriptions')
    .select('id, issued_at, prescription_items ( id ), professionals ( display_name )')
    .eq('clinic_id', clinicId)
    .eq('patient_id', patientId)
    .order('issued_at', { ascending: false })
    .limit(PER_SOURCE_LIMIT)

  if (error) return failed('prescriptions', error)

  return (data ?? []).map((row) => {
    const items = Array.isArray(row.prescription_items)
      ? row.prescription_items.length
      : 0

    return {
      id: `prescription:${row.id}`,
      kind: 'prescription' as const,
      occurredAt: new Date(row.issued_at),
      title: 'Prescrição',
      // A contagem responde "a receita tinha item?" sem dizer qual medicamento —
      // mesmo recorte que a auditoria de `prescription.created` usa.
      detail: items === 1 ? '1 item' : `${items} itens`,
      actor: professionalName(row.professionals),
    }
  })
}

async function loadVitals(
  client: SupabaseClient<Database>,
  clinicId: string,
  patientId: string,
): Promise<PatientEvent[]> {
  const { data, error } = await client
    .from('vitals')
    .select('id, measured_at')
    .eq('clinic_id', clinicId)
    .eq('patient_id', patientId)
    .order('measured_at', { ascending: false })
    .limit(PER_SOURCE_LIMIT)

  if (error) return failed('vitals', error)

  return (data ?? []).map((row) => ({
    id: `vitals:${row.id}`,
    kind: 'vitals' as const,
    occurredAt: new Date(row.measured_at),
    title: 'Sinais vitais registrados',
    // Os valores ficam no painel: pressão e glicemia fora de contexto viram
    // número solto, e número solto em prontuário convida a interpretação.
    detail: null,
    actor: null,
  }))
}

const documentKinds: Record<string, string> = {
  rg: 'RG',
  cpf: 'CPF',
  cnh: 'CNH',
  insurance_card: 'Carteirinha do convênio',
  exam: 'Exame',
  report: 'Laudo',
  consent: 'Termo de consentimento',
  other: 'Documento',
}

async function loadDocuments(
  client: SupabaseClient<Database>,
  clinicId: string,
  patientId: string,
): Promise<PatientEvent[]> {
  const { data, error } = await client
    .from('patient_documents')
    .select('id, created_at, kind, file_name')
    .eq('clinic_id', clinicId)
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
    .limit(PER_SOURCE_LIMIT)

  if (error) return failed('documents', error)

  return (data ?? []).map((row) => ({
    id: `document:${row.id}`,
    kind: 'document' as const,
    occurredAt: new Date(row.created_at),
    title: documentKinds[row.kind] ?? 'Documento',
    detail: row.file_name,
    actor: null,
  }))
}

/** Embed do PostgREST vem como objeto ou array, conforme a cardinalidade. */
function professionalName(value: unknown): string | null {
  const entry = Array.isArray(value) ? value[0] : value

  if (!entry || typeof entry !== 'object') return null

  const name = (entry as { display_name?: unknown }).display_name

  return typeof name === 'string' ? name : null
}

/**
 * Fonte que falhou some da timeline — e o log diz qual.
 *
 * A alternativa seria propagar o erro e derrubar a linha do tempo inteira porque
 * uma das seis consultas não voltou. Numa ficha de paciente, mostrar cinco
 * fontes é melhor que mostrar nenhuma.
 */
function failed(source: string, error: { code?: string | null }): PatientEvent[] {
  console.error('[patient-timeline] fonte indisponivel', {
    source,
    code: error.code ?? null,
  })

  return []
}
