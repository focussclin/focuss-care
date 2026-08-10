import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'
import type { AppointmentStatus } from '@/modules/_shared/domain/types'

/**
 * Tipos locais das relações e funções novas enquanto o schema remoto não foi
 * aplicado.
 *
 * Mesmo recurso — e mesmo motivo — de `tasks/infrastructure/tasksDatabase.ts` e
 * `rooms/infrastructure/roomsDatabase.ts`. O cliente real continua sendo o
 * Supabase autenticado; este contrato só evita editar à mão o
 * `database.types.ts`, que é **gerado** por `npm run db:types`.
 *
 * Editar o arquivo gerado seria pior do que parece: a próxima geração o
 * sobrescreve em silêncio, e o código que dependia da edição passa a compilar
 * contra um tipo que não existe mais — ou, pior, continua compilando porque
 * alguém copiou a definição para outro lugar, e as duas divergem.
 *
 * Depois de aplicar `20260810_patient_portal.sql`, rode `npm run db:types` e
 * **remova este arquivo**.
 */

/** `invoice_status` do banco. Cancelada nunca chega ao portal. */
export type PortalInvoiceStatus =
  | 'draft'
  | 'issued'
  | 'partially_paid'
  | 'paid'
  | 'overdue'
  | 'canceled'

export interface PortalProfileRow {
  patient_id: string
  clinic_id: string
  clinic_name: string | null
  full_name: string
  social_name: string | null
  birth_date: string | null
  email: string | null
  phone: string | null
}

export interface PortalAppointmentRow {
  id: string
  patient_id: string
  starts_at: string
  ends_at: string
  status: AppointmentStatus
  reason: string | null
  professional_name: string | null
}

export interface PortalInvoiceRow {
  id: string
  patient_id: string
  status: PortalInvoiceStatus
  issue_date: string | null
  due_date: string | null
  total_cents: number
  paid_cents: number
}

/** Estado do convite, como `preview_patient_portal_invite` o devolve. */
export type PortalInvitePreviewStatus =
  | 'valid'
  | 'expired'
  | 'accepted'
  | 'revoked'
  | 'not-found'

export interface PortalInvitePreviewRow {
  status: PortalInvitePreviewStatus
  clinic_name: string | null
  patient_first_name: string | null
  masked_email: string | null
  expires_at: string | null
}

export interface PortalInviteCreatedRow {
  token: string
  expires_at: string
}

export interface PortalAccountRow {
  id: string
  clinic_id: string
  patient_id: string
  user_id: string
  status: 'active' | 'revoked'
  linked_at: string
}

export interface PortalInviteRow {
  id: string
  clinic_id: string
  patient_id: string
  email: string
  status: 'pending' | 'accepted' | 'revoked'
  expires_at: string
  created_at: string
  accepted_at: string | null
}

export interface PortalQueryError {
  code?: string | null
  message?: string | null
}

export interface PortalQueryResponse<T> {
  data: T
  error: PortalQueryError | null
}

export interface PortalInviteQueryBuilder
  extends PromiseLike<PortalQueryResponse<readonly PortalInviteRow[] | null>> {
  eq(column: string, value: string): PortalInviteQueryBuilder
  order(column: string, options: { ascending: boolean }): PortalInviteQueryBuilder
  limit(count: number): PortalInviteQueryBuilder
  maybeSingle(): PromiseLike<PortalQueryResponse<PortalInviteRow | null>>
}

/**
 * Cliente com as funções do portal.
 *
 * Só `rpc` e a leitura de `patient_portal_invites`. **Não há `from('patients')`
 * nem `from('appointments')` aqui de propósito**: do lado do paciente, nada é
 * lido por tabela — o que ele vê sai de função com lista fechada de colunas, e
 * um `from()` disponível neste tipo seria o convite para alguém contornar isso
 * sem perceber.
 */
export interface PortalClient {
  from(relation: 'patient_portal_invites'): {
    select(columns: string): PortalInviteQueryBuilder
  }

  rpc(
    fn: 'portal_my_profile',
  ): PromiseLike<PortalQueryResponse<readonly PortalProfileRow[] | null>>
  rpc(
    fn: 'portal_my_appointments',
    args: { p_from: string; p_to: string },
  ): PromiseLike<PortalQueryResponse<readonly PortalAppointmentRow[] | null>>
  rpc(
    fn: 'portal_my_invoices',
  ): PromiseLike<PortalQueryResponse<readonly PortalInvoiceRow[] | null>>
  rpc(
    fn: 'preview_patient_portal_invite',
    args: { p_token: string },
  ): PromiseLike<PortalQueryResponse<readonly PortalInvitePreviewRow[] | null>>
  rpc(
    fn: 'create_patient_portal_invite',
    args: { p_patient_id: string; p_email: string; p_expires_in_days?: number },
  ): PromiseLike<PortalQueryResponse<readonly PortalInviteCreatedRow[] | null>>
  rpc(
    fn: 'revoke_patient_portal_invite',
    args: { p_invite_id: string },
  ): PromiseLike<PortalQueryResponse<null>>
  rpc(
    fn: 'accept_patient_portal_invite',
    args: { p_token: string },
  ): PromiseLike<PortalQueryResponse<string | null>>
}

/**
 * Converte o cliente gerado no contrato local.
 *
 * O `as unknown as` está isolado AQUI, num arquivo só, e é o preço de trabalhar
 * antes da migration. Espalhado pelos adapters, cada `as` seria uma afirmação
 * separada sobre o schema — e nenhuma delas cairia quando o schema mudasse.
 */
export function asPortalClient(client: SupabaseClient<Database>): PortalClient {
  return client as unknown as PortalClient
}
