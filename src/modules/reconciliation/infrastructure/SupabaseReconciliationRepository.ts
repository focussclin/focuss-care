import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import type {
  BankAccount,
  BankTransaction,
  NewBankAccountData,
  NewBankTransactionData,
  ReconcileBankTransactionData,
  ReconciliationCandidate,
} from '../domain/Reconciliation'
import type {
  BankTransactionReconciliationResult,
  ReconciliationRepository,
} from '../domain/ReconciliationRepository'
import { ReconciliationRepositoryError } from '../domain/ReconciliationRepositoryError'
import {
  asReconciliationClient,
  type BankAccountRow,
  type BankReconciliationRow,
  type BankTransactionRow,
  type InvoiceCandidateRow,
  type PayableCandidateRow,
  type ReconciliationClient,
  type ReconciliationQueryError,
} from './reconciliationDatabase'

const ACCOUNT_SELECT = 'id, clinic_id, name, bank_name, last_four, notes, is_active, updated_at'
const TRANSACTION_SELECT = `
  id,
  clinic_id,
  bank_account_id,
  occurred_on,
  direction,
  amount_cents,
  description,
  external_id,
  status,
  notes,
  account:bank_accounts ( id, name ),
  reconciliation:bank_reconciliations ( id, transaction_id, invoice_id, payable_id, matched_amount_cents, notes )
`
const ACCOUNT_ROW_CAP = 100
const TRANSACTION_ROW_CAP = 500
const CANDIDATE_ROW_CAP = 300

export class SupabaseReconciliationRepository implements ReconciliationRepository {
  private readonly client: ReconciliationClient

  constructor(client: SupabaseClient<Database>) {
    this.client = asReconciliationClient(client)
  }

  async listAccounts(clinicId: string): Promise<BankAccount[]> {
    const { data, error } = await this.client
      .from('bank_accounts')
      .select(ACCOUNT_SELECT)
      .eq('clinic_id', clinicId)
      .order('is_active', { ascending: false })
      .order('name', { ascending: true })
      .limit(ACCOUNT_ROW_CAP)

    if (error) throw toReconciliationError(error)
    return (data ?? []).map((row) => toAccount(row as unknown as BankAccountRow))
  }

  async listTransactions(clinicId: string): Promise<BankTransaction[]> {
    const { data, error } = await this.client
      .from('bank_transactions')
      .select(TRANSACTION_SELECT)
      .eq('clinic_id', clinicId)
      .order('occurred_on', { ascending: false })
      .limit(TRANSACTION_ROW_CAP)

    if (error) throw toReconciliationError(error)
    return (data ?? []).map((row) => toTransaction(row as unknown as BankTransactionRow))
  }

  async listInvoiceCandidates(clinicId: string): Promise<ReconciliationCandidate[]> {
    const { data, error } = await this.client
      .from('invoices')
      .select('id, total_cents, due_date, created_at, patients ( full_name )')
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false })
      .limit(CANDIDATE_ROW_CAP)

    if (error) throw toReconciliationError(error)
    return (data ?? []).map((row) => toInvoiceCandidate(row as unknown as InvoiceCandidateRow))
  }

  async listPayableCandidates(clinicId: string): Promise<ReconciliationCandidate[]> {
    const { data, error } = await this.client
      .from('payables')
      .select('id, description, supplier, amount_cents, due_date')
      .eq('clinic_id', clinicId)
      .is('paid_at', null)
      .order('due_date', { ascending: true })
      .limit(CANDIDATE_ROW_CAP)

    if (error) throw toReconciliationError(error)
    return (data ?? []).map((row) => toPayableCandidate(row as unknown as PayableCandidateRow))
  }

  async createAccount(
    clinicId: string,
    createdBy: string,
    data: NewBankAccountData,
  ): Promise<BankAccount> {
    const { data: row, error } = await this.client
      .from('bank_accounts')
      .insert({
        clinic_id: clinicId,
        name: data.name,
        bank_name: data.bankName,
        last_four: data.lastFour,
        notes: data.notes,
        created_by: createdBy,
      })
      .select(ACCOUNT_SELECT)
      .single()

    if (error) throw toReconciliationError(error)
    if (!row) throw notFound()
    return toAccount(row as unknown as BankAccountRow)
  }

  async updateAccount(clinicId: string, accountId: string, isActive: boolean): Promise<BankAccount> {
    const { data: row, error } = await this.client
      .from('bank_accounts')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('clinic_id', clinicId)
      .eq('id', accountId)
      .select(ACCOUNT_SELECT)
      .maybeSingle()

    if (error) throw toReconciliationError(error)
    if (!row) throw notFound()
    return toAccount(row as unknown as BankAccountRow)
  }

  async createTransaction(
    clinicId: string,
    createdBy: string,
    data: NewBankTransactionData,
  ): Promise<BankTransaction> {
    const { data: row, error } = await this.client
      .from('bank_transactions')
      .insert({
        clinic_id: clinicId,
        bank_account_id: data.bankAccountId,
        occurred_on: toDateOnly(data.occurredOn),
        direction: data.direction,
        amount_cents: data.amountCents,
        description: data.description,
        external_id: data.externalId,
        notes: data.notes,
        created_by: createdBy,
      })
      .select(TRANSACTION_SELECT)
      .single()

    if (error) throw toReconciliationError(error)
    if (!row) throw notFound()
    return toTransaction(row as unknown as BankTransactionRow)
  }

  async reconcileTransaction(
    clinicId: string,
    data: ReconcileBankTransactionData,
  ): Promise<BankTransactionReconciliationResult> {
    const { data: row, error } = await this.client.rpc('reconcile_bank_transaction', {
      p_clinic_id: clinicId,
      p_transaction_id: data.transactionId,
      p_invoice_id: data.invoiceId,
      p_payable_id: data.payableId,
      p_notes: data.notes,
    })

    if (error) throw toReconciliationError(error)
    if (!row) throw notFound()
    const reconciliation = row as unknown as BankReconciliationRow
    return {
      id: reconciliation.id,
      transactionId: reconciliation.transaction_id,
      invoiceId: reconciliation.invoice_id,
      payableId: reconciliation.payable_id,
      matchedAmountCents: reconciliation.matched_amount_cents,
    }
  }
}

function toAccount(row: BankAccountRow): BankAccount {
  return {
    id: row.id,
    name: row.name,
    bankName: row.bank_name,
    lastFour: row.last_four,
    notes: row.notes,
    isActive: row.is_active,
    updatedAt: new Date(row.updated_at),
  }
}

function toTransaction(row: BankTransactionRow): BankTransaction {
  const reconciliation = row.reconciliation
    ? {
        id: row.reconciliation.id,
        invoiceId: row.reconciliation.invoice_id,
        payableId: row.reconciliation.payable_id,
        matchedAmountCents: row.reconciliation.matched_amount_cents,
        notes: row.reconciliation.notes,
      }
    : null

  return {
    id: row.id,
    bankAccountId: row.bank_account_id,
    bankAccountName: row.account?.name ?? 'Conta indisponível',
    occurredOn: new Date(`${row.occurred_on}T12:00:00`),
    direction: row.direction,
    amountCents: row.amount_cents,
    description: row.description,
    externalId: row.external_id,
    status: row.status,
    notes: row.notes,
    reconciliation,
  }
}

function toInvoiceCandidate(row: InvoiceCandidateRow): ReconciliationCandidate {
  return {
    id: row.id,
    label: row.patients?.full_name ? `Fatura · ${row.patients.full_name}` : 'Fatura sem paciente',
    amountCents: row.total_cents,
    date: new Date(row.due_date ? `${row.due_date}T12:00:00` : row.created_at),
    reference: row.due_date ? `venc. ${row.due_date}` : null,
  }
}

function toPayableCandidate(row: PayableCandidateRow): ReconciliationCandidate {
  return {
    id: row.id,
    label: row.supplier ? `${row.description} · ${row.supplier}` : row.description,
    amountCents: row.amount_cents,
    date: new Date(`${row.due_date}T12:00:00`),
    reference: `venc. ${row.due_date}`,
  }
}

function toDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function notFound(): ReconciliationRepositoryError {
  return new ReconciliationRepositoryError('not-found', 'transação indisponível')
}

function toReconciliationError(error: ReconciliationQueryError): ReconciliationRepositoryError {
  const code = error.code ?? undefined
  const message = error.message ?? ''

  if (code === '42P01' || code === 'PGRST205') return new ReconciliationRepositoryError('schema-not-ready', 'conciliação ausente', code)
  if (code === '42501' || /clinic_scope/i.test(message)) return new ReconciliationRepositoryError('forbidden', 'operação recusada pela policy', code)
  if (code === '23505') return new ReconciliationRepositoryError('duplicate', 'transação duplicada', code)
  if (code === 'P0002') return notFound()
  if (code === '22023' || /reconciliation|transaction|invoice|payable/i.test(message)) return new ReconciliationRepositoryError('invalid', 'conciliação inválida', code)
  if (/fetch|network|timeout|econnrefused/i.test(message)) return new ReconciliationRepositoryError('unavailable', 'falha de conexão', code)
  return new ReconciliationRepositoryError('unexpected', 'falha ao acessar conciliação', code)
}
