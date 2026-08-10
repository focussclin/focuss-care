import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import type {
  NewPrescriptionData,
  Prescription,
  PrescriptionItem,
} from '../domain/Prescription'
import { orderItems } from '../domain/Prescription'
import {
  PrescriptionRepositoryError,
  type PrescriptionRepository,
} from '../domain/PrescriptionRepository'

type Client = SupabaseClient<Database>

/**
 * `signature` e `external_id` ficam FORA do select.
 *
 * `signature` é `jsonb` de um emissor que não existe: lê-lo colocaria estrutura
 * desconhecida no DTO, e estrutura desconhecida acaba renderizada. `external_id`
 * é identificador de integração e nada na tela o usa. O que a tela precisa
 * saber sobre o emissor cabe em `signed_at` e `external_url`.
 */
const PRESCRIPTION_SELECT = `
  id,
  clinic_id,
  patient_id,
  encounter_id,
  author_id,
  issued_at,
  valid_until,
  signed_at,
  external_url,
  author:professionals ( id, display_name ),
  items:prescription_items (
    id, drug_name, dosage, route, frequency, duration, quantity, instructions, sort_order
  )
`

const PRESCRIPTION_CAP = 100

interface ItemRow {
  id: string
  drug_name: string
  dosage: string | null
  route: string | null
  frequency: string | null
  duration: string | null
  quantity: string | null
  instructions: string | null
  sort_order: number
}

interface PrescriptionRow {
  id: string
  patient_id: string
  encounter_id: string | null
  author_id: string
  issued_at: string
  valid_until: string | null
  signed_at: string | null
  external_url: string | null
  author: { id: string; display_name: string } | null
  items: ItemRow[] | null
}

function toItem(row: ItemRow): PrescriptionItem {
  return {
    id: row.id,
    drugName: row.drug_name,
    dosage: row.dosage,
    route: row.route,
    frequency: row.frequency,
    duration: row.duration,
    quantity: row.quantity,
    instructions: row.instructions,
    sortOrder: row.sort_order,
  }
}

function toPrescription(row: PrescriptionRow): Prescription {
  return {
    id: row.id,
    patientId: row.patient_id,
    encounterId: row.encounter_id,
    authorId: row.author_id,
    authorName: row.author?.display_name ?? null,
    issuedAt: new Date(row.issued_at),
    validUntil: row.valid_until ? new Date(row.valid_until) : null,
    signedAt: row.signed_at ? new Date(row.signed_at) : null,
    externalUrl: row.external_url,
    // A ordem é a que o profissional escreveu, e o banco não garante a volta.
    items: orderItems((row.items ?? []).map(toItem)),
  }
}

export class SupabasePrescriptionRepository implements PrescriptionRepository {
  constructor(private readonly client: Client) {}

  async listByPatient(clinicId: string, patientId: string): Promise<Prescription[]> {
    const { data, error } = await this.client
      .from('prescriptions')
      .select(PRESCRIPTION_SELECT)
      .eq('clinic_id', clinicId)
      .eq('patient_id', patientId)
      .order('issued_at', { ascending: false })
      .limit(PRESCRIPTION_CAP)

    if (error) throw toPrescriptionError(error)
    return (data ?? []).map((row) => toPrescription(row as unknown as PrescriptionRow))
  }

  /**
   * Consultas de VERIFICAÇÃO: só o `id`, sempre com a clínica no filtro.
   *
   * As FKs de `prescriptions` são de coluna única e não carregam o tenant —
   * mesma lacuna de `vitals`.
   */
  async patientBelongsTo(clinicId: string, patientId: string): Promise<boolean> {
    const { data, error } = await this.client
      .from('patients')
      .select('id')
      .eq('clinic_id', clinicId)
      .eq('id', patientId)
      .maybeSingle()

    if (error) throw toPrescriptionError(error)
    return data !== null
  }

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

    if (error) throw toPrescriptionError(error)
    return data !== null
  }

  /**
   * Cria a prescrição e seus itens.
   *
   * # Duas escritas, e o que acontece se a segunda falhar
   *
   * Não há RPC para isto no banco aplicado, e esta fatia **não cria migration**.
   * Sem função, cabeçalho e itens são dois `insert`, e uma falha no segundo
   * deixaria a prescrição sem item.
   *
   * A leitura protege quem lê: `listByPatient` traz os itens junto, e uma
   * prescrição sem item aparece como tal — vazia e visível, nunca como receita
   * completa. O painel a mostra com o aviso, e a saída é prescrever de novo,
   * que é o mesmo caminho de qualquer correção nesta tabela append-only.
   *
   * A alternativa honesta seria uma função no banco; ela fica registrada como
   * desbloqueio no runbook, e não como algo que esta camada finge ter.
   *
   * `signed_at`, `signature`, `external_id` e `external_url` **não entram no
   * payload**: pertencem a um emissor externo que não existe.
   */
  async create(
    clinicId: string,
    authorId: string,
    data: NewPrescriptionData,
  ): Promise<Prescription> {
    const { data: header, error } = await this.client
      .from('prescriptions')
      .insert({
        clinic_id: clinicId,
        patient_id: data.patientId,
        encounter_id: data.encounterId,
        author_id: authorId,
        issued_at: new Date().toISOString(),
        valid_until: data.validUntil?.toISOString() ?? null,
      })
      .select('id')
      .single()

    if (error) throw toPrescriptionError(error)
    if (!header) throw new PrescriptionRepositoryError('unexpected', 'insert sem retorno')

    const prescriptionId = (header as { id: string }).id

    const { error: itemsError } = await this.client.from('prescription_items').insert(
      data.items.map((item, index) => ({
        clinic_id: clinicId,
        prescription_id: prescriptionId,
        drug_name: item.drugName,
        dosage: item.dosage,
        route: item.route,
        frequency: item.frequency,
        duration: item.duration,
        quantity: item.quantity,
        instructions: item.instructions,
        // A ordem digitada é a ordem da receita.
        sort_order: index,
      })),
    )

    if (itemsError) throw toPrescriptionError(itemsError)

    const { data: created, error: readError } = await this.client
      .from('prescriptions')
      .select(PRESCRIPTION_SELECT)
      .eq('clinic_id', clinicId)
      .eq('id', prescriptionId)
      .maybeSingle()

    if (readError) throw toPrescriptionError(readError)
    if (!created) throw new PrescriptionRepositoryError('not-found', 'prescrição ausente')
    return toPrescription(created as unknown as PrescriptionRow)
  }
}

function toPrescriptionError(error: {
  code?: string | null
  message?: string | null
}): PrescriptionRepositoryError {
  const code = error.code ?? undefined
  const message = error.message ?? ''

  if (code === '42501' || code === 'PGRST301') {
    return new PrescriptionRepositoryError('forbidden', 'recusado pela policy', code)
  }
  /*
   * `23503` é chave estrangeira: paciente, atendimento ou profissional ausente
   * nesta clínica. "Tente de novo" nunca vai passar.
   */
  if (code === '23503') {
    return new PrescriptionRepositoryError('not-found', 'alvo ausente', code)
  }
  if (/fetch|network|timeout|econnrefused/i.test(message)) {
    return new PrescriptionRepositoryError('unavailable', 'falha de conexão', code)
  }
  return new PrescriptionRepositoryError('unexpected', 'falha ao acessar prescrições', code)
}
