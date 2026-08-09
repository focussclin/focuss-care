import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import type { BankDirection, BankTransactionStatus } from '../domain/Reconciliation'

/** Tipos locais enquanto `20260809_bank_reconciliation.sql` não foi aplicada. */
export interface BankAccountRow {
  id: string
  clinic_id: string
  name: string
  bank_name: string | null
  last_four: string | null
  notes: string | null
  is_active: boolean
  updated_at: string
}

export interface BankReconciliationRow {
  id: string
  transaction_id: string
  invoice_id: string | null
  payable_id: string | null
  matched_amount_cents: number
  notes: string | null
}

export interface BankTransactionRow {
  id: string
  clinic_id: string
  bank_account_id: string
  occurred_on: string
  direction: BankDirection
  amount_cents: number
  description: string
  external_id: string | null
  status: BankTransactionStatus
  notes: string | null
  account: { id: string; name: string } | null
  reconciliation: BankReconciliationRow | null
}

export interface InvoiceCandidateRow {
  id: string
  total_cents: number
  due_date: string | null
  created_at: string
  patients: { full_name: string } | null
}

export interface PayableCandidateRow {
  id: string
  description: string
  supplier: string | null
  amount_cents: number
  due_date: string
}

export interface BankAccountInsert {
  clinic_id: string
  name: string
  bank_name: string | null
  last_four: string | null
  notes: string | null
  created_by: string
}

export interface BankAccountUpdate {
  is_active?: boolean
  updated_at?: string
}

export interface BankTransactionInsert {
  clinic_id: string
  bank_account_id: string
  occurred_on: string
  direction: BankDirection
  amount_cents: number
  description: string
  external_id: string | null
  notes: string | null
  created_by: string
}

export interface ReconciliationQueryError {
  code?: string | null
  message?: string | null
}

export interface ReconciliationQueryResponse<T> {
  data: T
  error: ReconciliationQueryError | null
}

export interface AccountQueryBuilder
  extends PromiseLike<ReconciliationQueryResponse<readonly BankAccountRow[] | null>> {
  eq(column: string, value: string | boolean): AccountQueryBuilder
  order(column: string, options: { ascending: boolean }): AccountQueryBuilder
  limit(count: number): AccountQueryBuilder
  select(columns: string): AccountQueryBuilder
  insert(values: BankAccountInsert): AccountQueryBuilder
  update(values: BankAccountUpdate): AccountQueryBuilder
  single(): PromiseLike<ReconciliationQueryResponse<BankAccountRow | null>>
  maybeSingle(): PromiseLike<ReconciliationQueryResponse<BankAccountRow | null>>
}

export interface TransactionQueryBuilder
  extends PromiseLike<ReconciliationQueryResponse<readonly BankTransactionRow[] | null>> {
  eq(column: string, value: string | boolean): TransactionQueryBuilder
  order(column: string, options: { ascending: boolean }): TransactionQueryBuilder
  limit(count: number): TransactionQueryBuilder
  select(columns: string): TransactionQueryBuilder
  insert(values: BankTransactionInsert): TransactionQueryBuilder
  single(): PromiseLike<ReconciliationQueryResponse<BankTransactionRow | null>>
}

export interface InvoiceQueryBuilder
  extends PromiseLike<ReconciliationQueryResponse<readonly InvoiceCandidateRow[] | null>> {
  eq(column: string, value: string): InvoiceQueryBuilder
  order(column: string, options: { ascending: boolean }): InvoiceQueryBuilder
  limit(count: number): InvoiceQueryBuilder
  select(columns: string): InvoiceQueryBuilder
}

export interface PayableQueryBuilder
  extends PromiseLike<ReconciliationQueryResponse<readonly PayableCandidateRow[] | null>> {
  eq(column: string, value: string | null): PayableQueryBuilder
  is(column: string, value: null): PayableQueryBuilder
  order(column: string, options: { ascending: boolean }): PayableQueryBuilder
  limit(count: number): PayableQueryBuilder
  select(columns: string): PayableQueryBuilder
}

export interface ReconciliationRpcArgs {
  p_clinic_id: string
  p_transaction_id: string
  p_invoice_id: string | null
  p_payable_id: string | null
  p_reconciled_by: string
  p_notes: string | null
}

export interface ReconciliationClient {
  from(relation: 'bank_accounts'): AccountQueryBuilder
  from(relation: 'bank_transactions'): TransactionQueryBuilder
  from(relation: 'invoices'): InvoiceQueryBuilder
  from(relation: 'payables'): PayableQueryBuilder
  rpc(
    fn: 'reconcile_bank_transaction',
    args: ReconciliationRpcArgs,
  ): PromiseLike<ReconciliationQueryResponse<BankReconciliationRow | null>>
}

export function asReconciliationClient(client: SupabaseClient<Database>): ReconciliationClient {
  return client as unknown as ReconciliationClient
}
