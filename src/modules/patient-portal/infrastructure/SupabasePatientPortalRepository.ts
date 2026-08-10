import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import type {
  CreatedPortalInvite,
  PortalAppointment,
  PortalInvitePreview,
  PortalInviteSummary,
  PortalInvoice,
  PortalProfile,
} from '../domain/PatientPortal'
import type { PatientPortalRepository } from '../domain/PatientPortalRepository'
import {
  PatientPortalRepositoryError,
  toPatientPortalError,
} from '../domain/PatientPortalRepositoryError'
import {
  asPortalClient,
  type PortalAppointmentRow,
  type PortalClient,
  type PortalInvitePreviewRow,
  type PortalInviteRow,
  type PortalInvoiceRow,
  type PortalProfileRow,
} from './portalDatabase'

/** Teto do histórico de convites de um paciente. */
const INVITE_ROW_CAP = 20

function toDate(value: string | null): Date | null {
  return value ? new Date(value) : null
}

function toProfile(row: PortalProfileRow): PortalProfile {
  return {
    patientId: row.patient_id,
    clinicId: row.clinic_id,
    clinicName: row.clinic_name,
    // O nome social é como a pessoa quer ser chamada; o legal fica disponível
    // para os documentos, e não para o cabeçalho da tela.
    displayName: row.social_name?.trim() || row.full_name,
    legalName: row.full_name,
    birthDate: toDate(row.birth_date),
    email: row.email,
    phone: row.phone,
  }
}

function toAppointment(row: PortalAppointmentRow): PortalAppointment {
  return {
    id: row.id,
    startsAt: new Date(row.starts_at),
    endsAt: new Date(row.ends_at),
    status: row.status,
    reason: row.reason,
    professionalName: row.professional_name,
  }
}

function toInvoice(row: PortalInvoiceRow): PortalInvoice {
  return {
    id: row.id,
    /*
     * `canceled` não deveria chegar — a função do banco já a exclui. O cast
     * estreita o tipo para o domínio, que não a conhece; se algum dia ela
     * passar, o `filter` abaixo é a segunda barreira.
     */
    status: row.status as PortalInvoice['status'],
    issueDate: toDate(row.issue_date),
    dueDate: toDate(row.due_date),
    totalCents: row.total_cents,
    paidCents: row.paid_cents,
  }
}

function toInviteSummary(row: PortalInviteRow): PortalInviteSummary {
  return {
    id: row.id,
    email: row.email,
    status: row.status,
    expiresAt: new Date(row.expires_at),
    createdAt: new Date(row.created_at),
    acceptedAt: toDate(row.accepted_at),
  }
}

/**
 * Adapter do portal do paciente.
 *
 * # A diferença que importa em relação aos outros adapters
 *
 * Nenhuma leitura do lado do PACIENTE usa `.from()`. Todas passam por `rpc`.
 *
 * Não é estilo: é a fronteira. `patients`, `appointments` e `invoices` têm
 * colunas internas — `admin_notes`, `internal_notes`, `notes`,
 * `cancel_reason` — e RLS filtra linha, não coluna. Uma policy de SELECT nessas
 * tabelas deixaria o paciente pedir `select=*` direto ao PostgREST, com a chave
 * publicável e o próprio JWT, e ler a anotação que a recepção escreveu sobre
 * ele.
 *
 * As funções da migration têm lista fechada de colunas. O que não está no
 * `select` delas não existe para quem chama — e é por isso que o tipo
 * `PortalClient` **não expõe** `from('patients')`: para que a próxima pessoa
 * precise mudar o contrato para errar, em vez de só escrever a consulta óbvia.
 */
export class SupabasePatientPortalRepository implements PatientPortalRepository {
  private readonly client: PortalClient

  constructor(client: SupabaseClient<Database>) {
    this.client = asPortalClient(client)
  }

  async myProfiles(): Promise<PortalProfile[]> {
    const { data, error } = await this.client.rpc('portal_my_profile')

    if (error) throw toPatientPortalError(error)

    return (data ?? []).map(toProfile)
  }

  async myAppointments(from: Date, to: Date): Promise<PortalAppointment[]> {
    const { data, error } = await this.client.rpc('portal_my_appointments', {
      p_from: from.toISOString(),
      p_to: to.toISOString(),
    })

    if (error) throw toPatientPortalError(error)

    return (data ?? []).map(toAppointment)
  }

  async myInvoices(): Promise<PortalInvoice[]> {
    const { data, error } = await this.client.rpc('portal_my_invoices')

    if (error) throw toPatientPortalError(error)

    /*
     * Segunda barreira contra a cobrança cancelada.
     *
     * A função do banco já a exclui. Este filtro existe porque as duas pontas
     * podem divergir — alguém edita a função e esquece a cláusula — e o custo do
     * erro é o paciente ver um valor que ninguém vai cobrar.
     */
    return (data ?? [])
      .filter((row) => row.status !== 'canceled')
      .map(toInvoice)
  }

  async previewInvite(token: string): Promise<PortalInvitePreview> {
    const { data, error } = await this.client.rpc(
      'preview_patient_portal_invite',
      { p_token: token },
    )

    if (error) throw toPatientPortalError(error)

    const row: PortalInvitePreviewRow | undefined = data?.[0]

    /*
     * Sem linha é `not-found`, e não erro.
     *
     * Token inexistente é a resposta esperada de uma URL digitada errado ou de
     * um link antigo. Lançar aqui faria a tela do convite mostrar "algo deu
     * errado" para o caso mais comum de todos.
     */
    if (!row) {
      return {
        status: 'not-found',
        clinicName: null,
        patientFirstName: null,
        maskedEmail: null,
        expiresAt: null,
      }
    }

    return {
      status: row.status,
      clinicName: row.clinic_name,
      patientFirstName: row.patient_first_name,
      maskedEmail: row.masked_email,
      expiresAt: toDate(row.expires_at),
    }
  }

  async acceptInvite(token: string): Promise<string> {
    const { data, error } = await this.client.rpc(
      'accept_patient_portal_invite',
      { p_token: token },
    )

    if (error) throw toPatientPortalError(error)

    if (!data) {
      throw new PatientPortalRepositoryError(
        'unexpected',
        'o vínculo não foi criado',
      )
    }

    return data
  }

  async createInvite(
    patientId: string,
    email: string,
    expiresInDays: number,
  ): Promise<CreatedPortalInvite> {
    /*
     * `p_patient_id` vem da rota; `clinic_id` NÃO é enviado.
     *
     * A função resolve a clínica por `current_clinic_id()` e recusa paciente de
     * outra — é o mesmo desenho de `create_invitation`. Mandar o `clinic_id`
     * daqui seria dar ao chamador a chance de escolher o tenant.
     */
    const { data, error } = await this.client.rpc(
      'create_patient_portal_invite',
      {
        p_patient_id: patientId,
        p_email: email,
        p_expires_in_days: expiresInDays,
      },
    )

    if (error) throw toPatientPortalError(error)

    const row = data?.[0]

    if (!row) {
      throw new PatientPortalRepositoryError(
        'unexpected',
        'o convite não foi criado',
      )
    }

    return { token: row.token, expiresAt: new Date(row.expires_at) }
  }

  async revokeInvite(inviteId: string): Promise<void> {
    const { error } = await this.client.rpc('revoke_patient_portal_invite', {
      p_invite_id: inviteId,
    })

    if (error) throw toPatientPortalError(error)
  }

  async listInvites(
    clinicId: string,
    patientId: string,
  ): Promise<PortalInviteSummary[]> {
    /*
     * Aqui `.from()` é legítimo: quem lê é a EQUIPE, a policy exige papel, e
     * `token_hash` — a única coluna sensível — fica fora do `select`.
     */
    const { data, error } = await this.client
      .from('patient_portal_invites')
      .select('id, clinic_id, patient_id, email, status, expires_at, created_at, accepted_at')
      .eq('clinic_id', clinicId)
      .eq('patient_id', patientId)
      .order('created_at', { ascending: false })
      .limit(INVITE_ROW_CAP)

    if (error) throw toPatientPortalError(error)

    return (data ?? []).map(toInviteSummary)
  }
}
