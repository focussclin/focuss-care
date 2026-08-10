'use client'

import {
  ArrowDownLeft,
  ArrowUpRight,
  Landmark,
  EyeOff,
  Link2,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  Undo2,
  WalletCards,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, type FormEvent } from 'react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Modal } from '@/components/ui/modal'
import { SelectField } from '@/components/ui/select-field'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { TextareaField } from '@/components/ui/textarea-field'
import { TextField } from '@/components/ui/text-field'
import { formatCents, parseCents } from '@/lib/utils/money'
import { cn } from '@/lib/utils/cn'

import { divergenceCents, MANUAL_STATUS_TRANSITIONS } from '../domain/Reconciliation'
import { reconciliationMessages, type BankAccountDto, type BankDirection, type BankTransactionDto, type BankTransactionFormValues, type BankTransactionStatus, type ReconcileFormValues } from '../schemas/reconciliation.schema'
import type { ReconciliationScreenProps } from './ReconciliationScreen.props'

type View = 'transactions' | 'accounts'
type StatusFilter = 'all' | 'pending' | 'reconciled' | 'ignored'
type DirectionFilter = 'all' | BankDirection

interface AccountFormState { name: string; bankName: string; lastFour: string; notes: string }
interface TransactionFormState { bankAccountId: string; occurredOn: string; direction: BankDirection; amount: string; description: string; externalId: string; notes: string }

const emptyAccount: AccountFormState = { name: '', bankName: '', lastFour: '', notes: '' }
const emptyTransaction: TransactionFormState = { bankAccountId: '', occurredOn: new Date().toISOString().slice(0, 10), direction: 'credit', amount: '', description: '', externalId: '', notes: '' }
const statusMeta: Record<BankTransactionDto['status'], { label: string; tone: StatusTone }> = {
  pending: { label: 'Pendente', tone: 'pending' },
  reconciled: { label: 'Conciliada', tone: 'positive' },
  ignored: { label: 'Ignorada', tone: 'neutral' },
}

export function ReconciliationScreen({
  accounts,
  transactions,
  invoiceCandidates,
  payableCandidates,
  onSubmitAccount,
  onToggleAccount,
  onSubmitTransaction,
  onReconcile,
  onChangeStatus,
  isLive,
  schemaPending = false,
}: ReconciliationScreenProps) {
  const router = useRouter()
  const [view, setView] = useState<View>('transactions')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending')
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('all')
  const [accountModalOpen, setAccountModalOpen] = useState(false)
  const [transactionModalOpen, setTransactionModalOpen] = useState(false)
  const [reconcileModalOpen, setReconcileModalOpen] = useState(false)
  const [accountForm, setAccountForm] = useState<AccountFormState>(emptyAccount)
  const [transactionForm, setTransactionForm] = useState<TransactionFormState>({ ...emptyTransaction })
  const [selectedTransaction, setSelectedTransaction] = useState<BankTransactionDto | null>(null)
  const [selectedTargetId, setSelectedTargetId] = useState('')
  const [reconcileNotes, setReconcileNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const canMutate = isLive && !schemaPending
  const activeAccounts = accounts.filter((account) => account.isActive)
  const pendingTransactions = transactions.filter((transaction) => transaction.status === 'pending')
  const visibleTransactions = useMemo(() => {
    const term = search.trim().toLowerCase()
    return transactions.filter((transaction) => {
      if (statusFilter !== 'all' && transaction.status !== statusFilter) return false
      if (directionFilter !== 'all' && transaction.direction !== directionFilter) return false
      if (!term) return true
      return transaction.description.toLowerCase().includes(term) || transaction.bankAccountName.toLowerCase().includes(term) || transaction.externalId?.toLowerCase().includes(term)
    })
  }, [directionFilter, search, statusFilter, transactions])

  function openAccount() { setAccountForm(emptyAccount); setError(null); setAccountModalOpen(true) }
  function openTransaction() { setTransactionForm({ ...emptyTransaction, bankAccountId: activeAccounts[0]?.id ?? '' }); setError(null); setTransactionModalOpen(true) }
  function openReconcile(transaction: BankTransactionDto) { setSelectedTransaction(transaction); setSelectedTargetId(''); setReconcileNotes(''); setError(null); setReconcileModalOpen(true) }
  function closeModals(force = false) { if (saving && !force) return; setAccountModalOpen(false); setTransactionModalOpen(false); setReconcileModalOpen(false); setSelectedTransaction(null); setAccountForm(emptyAccount); setTransactionForm({ ...emptyTransaction }); setSelectedTargetId(''); setReconcileNotes(''); setError(null) }

  async function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null)
    if (accountForm.name.trim().length < 2) { setError(reconciliationMessages.accountNameRequired); return }
    setSaving(true)
    try {
      const failure = await onSubmitAccount(accountForm)
      if (failure) { setError(failure); return }
      closeModals(true); router.refresh()
    } catch { setError(reconciliationMessages.unavailable) } finally { setSaving(false) }
  }

  async function submitTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null)
    const amountCents = parseCents(transactionForm.amount)
    if (!transactionForm.bankAccountId) { setError(reconciliationMessages.accountInvalid); return }
    if (amountCents === null || amountCents <= 0) { setError(reconciliationMessages.amountInvalid); return }
    if (transactionForm.description.trim().length < 2) { setError(reconciliationMessages.descriptionRequired); return }
    setSaving(true)
    try {
      const values: BankTransactionFormValues = { bankAccountId: transactionForm.bankAccountId, occurredOn: transactionForm.occurredOn, direction: transactionForm.direction, amountCents, description: transactionForm.description, externalId: transactionForm.externalId, notes: transactionForm.notes }
      const failure = await onSubmitTransaction(values)
      if (failure) { setError(failure); return }
      closeModals(true); router.refresh()
    } catch { setError(reconciliationMessages.unavailable) } finally { setSaving(false) }
  }

  async function submitReconcile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null)
    if (!selectedTransaction || !selectedTargetId) { setError(reconciliationMessages.targetRequired); return }
    setSaving(true)
    try {
      const values: ReconcileFormValues = selectedTransaction.direction === 'credit'
        ? { transactionId: selectedTransaction.id, invoiceId: selectedTargetId, payableId: null, notes: reconcileNotes }
        : { transactionId: selectedTransaction.id, invoiceId: null, payableId: selectedTargetId, notes: reconcileNotes }
      const failure = await onReconcile(values)
      if (failure) { setError(failure); return }
      closeModals(true); router.refresh()
    } catch { setError(reconciliationMessages.unavailable) } finally { setSaving(false) }
  }

  async function changeStatus(transaction: BankTransactionDto, to: BankTransactionStatus) {
    setBusyId(transaction.id); setError(null)
    try {
      // `transaction.status` é o estado que ESTA tela viu; ele vai para o
      // `WHERE` do UPDATE e é o que recusa a troca se alguém conciliou antes.
      const failure = await onChangeStatus(transaction.id, transaction.status, to)
      if (failure) setError(failure); else router.refresh()
    } catch { setError(reconciliationMessages.unavailable) } finally { setBusyId(null) }
  }

  async function toggleAccount(account: BankAccountDto) {
    setBusyId(account.id); setError(null)
    try {
      const failure = await onToggleAccount(account.id, !account.isActive)
      if (failure) setError(failure); else router.refresh()
    } catch { setError(reconciliationMessages.unavailable) } finally { setBusyId(null) }
  }

  const candidates = selectedTransaction?.direction === 'credit' ? invoiceCandidates : payableCandidates
  const selectedCandidate = candidates.find((candidate) => candidate.id === selectedTargetId) ?? null
  /*
   * A divergência é derivada de dois valores reais, e não de um status.
   *
   * `reconcile_bank_transaction` grava `matched_amount_cents` com o valor CHEIO
   * da transação — nunca com o da fatura. Casar R$ 500 do extrato com uma
   * fatura de R$ 450 é aceito em silêncio, e `bank_reconciliations` não tem
   * UPDATE nem DELETE: a evidência errada fica. Por isso o aviso é ANTES.
   */
  const divergence = selectedTransaction && selectedCandidate
    ? divergenceCents(selectedTransaction.amountCents, selectedCandidate.amountCents)
    : 0
  const totalCredits = transactions.filter((transaction) => transaction.direction === 'credit').reduce((sum, transaction) => sum + transaction.amountCents, 0)
  const totalDebits = transactions.filter((transaction) => transaction.direction === 'debit').reduce((sum, transaction) => sum + transaction.amountCents, 0)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Gestão financeira" title="Conciliação bancária" description="Relacione movimentos do extrato às faturas e despesas da clínica." actions={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={openAccount} disabled={!canMutate}><Plus aria-hidden className="size-4" />Nova conta</Button><Button onClick={openTransaction} disabled={!canMutate || activeAccounts.length === 0}><Plus aria-hidden className="size-4" />Registrar transação</Button></div>} />

      {schemaPending ? <div role="status" className="flex items-start gap-3 rounded-card border border-status-pending/25 bg-status-pending-surface px-4 py-3 text-aux text-status-pending"><ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" /><div><p className="font-semibold">Conciliação ainda não conectada ao banco</p><p className="mt-0.5 text-label">A interface está pronta, mas a migration <code>20260809_bank_reconciliation.sql</code> precisa ser aplicada antes de registrar movimentos.</p></div></div> : !isLive ? <div role="status" className="rounded-card border border-border-card bg-surface px-4 py-3 text-aux text-muted">Modo demonstração: nenhuma conta ou transação será salva sem o Supabase configurado.</div> : <div role="status" className="rounded-card border border-brand/20 bg-brand-subtle px-4 py-3 text-label text-link">Entrada automática de extratos ainda depende de um provedor bancário. O núcleo manual e os vínculos já estão preparados sem armazenar credenciais bancárias.</div>}
      {error && !accountModalOpen && !transactionModalOpen && !reconcileModalOpen ? <p role="alert" className="rounded-card border border-danger/30 bg-danger-surface px-4 py-3 text-aux text-danger">{error}</p> : null}

      <div className="grid grid-cols-2 gap-4 nav:grid-cols-4"><Metric icon={Landmark} label="Contas ativas" value={String(activeAccounts.length)} /><Metric icon={Link2} label="Pendentes" value={String(pendingTransactions.length)} tone="pending" /><Metric icon={ArrowDownLeft} label="Entradas" value={formatCents(totalCredits)} tone="positive" /><Metric icon={ArrowUpRight} label="Saídas" value={formatCents(totalDebits)} tone="negative" /></div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border-card"><TabButton active={view === 'transactions'} onClick={() => setView('transactions')}>Transações</TabButton><TabButton active={view === 'accounts'} onClick={() => setView('accounts')}>Contas bancárias</TabButton></div>

      {view === 'transactions' ? <><Card className="overflow-hidden"><div className="flex flex-wrap items-center gap-3 border-b border-border-card px-4 py-4 sm:px-5"><div className="relative min-w-[220px] flex-1"><Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" /><TextField hideLabel label="Buscar transações" placeholder="Descrição, conta ou identificador" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" /></div><div className="w-full sm:w-44"><SelectField label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} options={[{ value: 'pending', label: 'Pendentes' }, { value: 'reconciled', label: 'Conciliadas' }, { value: 'ignored', label: 'Ignoradas' }, { value: 'all', label: 'Todas' }]} /></div><div className="w-full sm:w-40"><SelectField label="Tipo" value={directionFilter} onChange={(event) => setDirectionFilter(event.target.value as DirectionFilter)} options={[{ value: 'all', label: 'Entradas e saídas' }, { value: 'credit', label: 'Entradas' }, { value: 'debit', label: 'Saídas' }]} /></div>{(search || statusFilter !== 'pending' || directionFilter !== 'all') ? <Button variant="ghost" onClick={() => { setSearch(''); setStatusFilter('pending'); setDirectionFilter('all') }}><RotateCcw aria-hidden className="size-4" />Limpar</Button> : null}</div></Card>{visibleTransactions.length === 0 ? <Card><EmptyState icon={Landmark} title={transactions.length === 0 ? 'Nenhuma transação cadastrada.' : 'Nenhuma transação com estes filtros.'} description={transactions.length === 0 ? 'Registre um movimento manual ou conecte um provedor de extrato quando estiver configurado.' : 'Ajuste a busca e os filtros para localizar outro movimento.'} action={<Button onClick={openTransaction} disabled={!canMutate || activeAccounts.length === 0}><Plus aria-hidden className="size-4" />Registrar transação</Button>} /></Card> : <Card className="overflow-hidden"><div className="divide-y divide-border-card">{visibleTransactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} canMutate={canMutate} busy={busyId === transaction.id} onReconcile={openReconcile} onChangeStatus={changeStatus} />)}</div></Card>}</> : <AccountsPanel accounts={accounts} canMutate={canMutate} busyId={busyId} onCreate={openAccount} onToggle={toggleAccount} />}

      <Modal open={accountModalOpen} onOpenChange={(open) => (open ? setAccountModalOpen(true) : closeModals())} title="Nova conta bancária" description="Guarde apenas os dados necessários para identificar a conta." footer={<><Button variant="secondary" onClick={() => closeModals()} disabled={saving}>Cancelar</Button><Button type="submit" form="bank-account-form" isLoading={saving}>Salvar conta</Button></>}><form id="bank-account-form" className="flex flex-col gap-4" onSubmit={submitAccount}>{error && accountModalOpen ? <p role="alert" className="rounded-field bg-danger-surface px-3 py-2 text-label text-danger">{error}</p> : null}<TextField label="Nome da conta" value={accountForm.name} onChange={(event) => setAccountForm((current) => ({ ...current, name: event.target.value }))} required /><div className="grid gap-4 sm:grid-cols-2"><TextField label="Banco (opcional)" value={accountForm.bankName} onChange={(event) => setAccountForm((current) => ({ ...current, bankName: event.target.value }))} /><TextField label="Últimos 4 dígitos" inputMode="numeric" maxLength={4} value={accountForm.lastFour} onChange={(event) => setAccountForm((current) => ({ ...current, lastFour: event.target.value }))} /></div><TextareaField label="Observações (opcional)" value={accountForm.notes} onChange={(event) => setAccountForm((current) => ({ ...current, notes: event.target.value }))} /></form></Modal>

      <Modal open={transactionModalOpen} onOpenChange={(open) => (open ? setTransactionModalOpen(true) : closeModals())} title="Registrar transação" description="Use esta entrada para validar o fluxo até o provedor bancário ser configurado." footer={<><Button variant="secondary" onClick={() => closeModals()} disabled={saving}>Cancelar</Button><Button type="submit" form="bank-transaction-form" isLoading={saving}>Salvar transação</Button></>}><form id="bank-transaction-form" className="flex flex-col gap-4" onSubmit={submitTransaction}>{error && transactionModalOpen ? <p role="alert" className="rounded-field bg-danger-surface px-3 py-2 text-label text-danger">{error}</p> : null}<div className="grid gap-4 sm:grid-cols-2"><SelectField label="Conta" value={transactionForm.bankAccountId} onChange={(event) => setTransactionForm((current) => ({ ...current, bankAccountId: event.target.value }))} options={activeAccounts.map((account) => ({ value: account.id, label: account.name }))} /><TextField label="Data" type="date" value={transactionForm.occurredOn} onChange={(event) => setTransactionForm((current) => ({ ...current, occurredOn: event.target.value }))} /></div><div className="grid gap-4 sm:grid-cols-2"><SelectField label="Tipo" value={transactionForm.direction} onChange={(event) => setTransactionForm((current) => ({ ...current, direction: event.target.value as BankDirection }))} options={[{ value: 'credit', label: 'Entrada' }, { value: 'debit', label: 'Saída' }]} /><TextField label="Valor" placeholder="R$ 0,00" value={transactionForm.amount} onChange={(event) => setTransactionForm((current) => ({ ...current, amount: event.target.value }))} /></div><TextField label="Descrição" value={transactionForm.description} onChange={(event) => setTransactionForm((current) => ({ ...current, description: event.target.value }))} required /><TextField label="Identificador externo (opcional)" value={transactionForm.externalId} onChange={(event) => setTransactionForm((current) => ({ ...current, externalId: event.target.value }))} /><TextareaField label="Observações (opcional)" value={transactionForm.notes} onChange={(event) => setTransactionForm((current) => ({ ...current, notes: event.target.value }))} /></form></Modal>

      <Modal open={reconcileModalOpen} onOpenChange={(open) => (open ? setReconcileModalOpen(true) : closeModals())} title="Conciliar transação" description="O vínculo fica gravado como evidência e a transação muda para conciliada." footer={<><Button variant="secondary" onClick={() => closeModals()} disabled={saving}>Cancelar</Button><Button type="submit" form="reconcile-form" isLoading={saving}>Confirmar vínculo</Button></>}><form id="reconcile-form" className="flex flex-col gap-4" onSubmit={submitReconcile}>{error && reconcileModalOpen ? <p role="alert" className="rounded-field bg-danger-surface px-3 py-2 text-label text-danger">{error}</p> : null}{selectedTransaction ? <div className="rounded-card border border-border-card bg-row-hover p-4"><p className="text-aux font-semibold text-foreground">{selectedTransaction.description}</p><p className="mt-1 text-label text-muted">{selectedTransaction.direction === 'credit' ? 'Entrada' : 'Saída'} · {formatCents(selectedTransaction.amountCents)} · {formatDate(selectedTransaction.occurredOn)}</p></div> : null}<SelectField label={selectedTransaction?.direction === 'credit' ? 'Fatura correspondente' : 'Despesa correspondente'} value={selectedTargetId} onChange={(event) => setSelectedTargetId(event.target.value)} options={[{ value: '', label: 'Selecione um registro' }, ...candidates.map((candidate) => ({ value: candidate.id, label: `${candidate.label} · ${formatCents(candidate.amountCents)}` }))]} />{divergence !== 0 && selectedCandidate ? <div role="status" className="rounded-card border border-status-pending/25 bg-status-pending-surface px-4 py-3 text-label text-status-pending"><p className="font-semibold">Divergência de {formatCents(Math.abs(divergence))}</p><p className="mt-0.5">Transação {formatCents(selectedTransaction?.amountCents ?? 0)} · registro {formatCents(selectedCandidate.amountCents)}. {reconciliationMessages.divergenceWarning}</p></div> : null}<TextareaField label="Observações (opcional)" value={reconcileNotes} onChange={(event) => setReconcileNotes(event.target.value)} /></form></Modal>
    </div>
  )
}

function Metric({ icon: Icon, label, value, tone = 'neutral' }: { icon: typeof Landmark; label: string; value: string; tone?: 'neutral' | 'pending' | 'positive' | 'negative' }) {
  return <Card className="flex min-w-0 items-start gap-3 p-4"><span className={cn('flex size-9 shrink-0 items-center justify-center rounded-field', tone === 'positive' ? 'bg-status-positive-surface text-status-positive' : tone === 'negative' ? 'bg-status-negative-surface text-status-negative' : tone === 'pending' ? 'bg-status-pending-surface text-status-pending' : 'bg-row-hover text-muted')}><Icon aria-hidden className="size-4" /></span><div className="min-w-0"><p className="truncate text-label text-muted">{label}</p><p className="mt-1 truncate text-card-title font-semibold text-foreground">{value}</p></div></Card>
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) { return <button type="button" onClick={onClick} className={cn('border-b-2 px-3 py-2 text-aux font-semibold transition-colors', active ? 'border-link text-link' : 'border-transparent text-muted hover:text-foreground')}>{children}</button> }

function TransactionRow({ transaction, canMutate, busy, onReconcile, onChangeStatus }: { transaction: BankTransactionDto; canMutate: boolean; busy: boolean; onReconcile: (transaction: BankTransactionDto) => void; onChangeStatus: (transaction: BankTransactionDto, to: BankTransactionStatus) => void }) {
  const meta = statusMeta[transaction.status]
  /*
   * A evidência do vínculo já vinha do banco no mesmo SELECT e era descartada:
   * a linha conciliada mostrava um selo verde e mais nada. Sem o valor casado,
   * conferir uma conciliação exigia sair da tela — e `bank_reconciliations` não
   * tem UPDATE nem DELETE, então é justamente o que mais precisa ser lido.
   *
   * O alvo aparece pelo TIPO, não pelo nome: a fatura conciliada pode já ter
   * saído da lista de candidatas, e batizá-la aqui seria inventar o rótulo.
   */
  const evidence = transaction.reconciliation
  const buttons = canMutate ? MANUAL_STATUS_TRANSITIONS[transaction.status] : []
  return <div className="flex flex-wrap items-center gap-4 px-4 py-4 sm:px-5"><span className={cn('flex size-9 shrink-0 items-center justify-center rounded-field', transaction.direction === 'credit' ? 'bg-status-positive-surface text-status-positive' : 'bg-status-negative-surface text-status-negative')}>{transaction.direction === 'credit' ? <ArrowDownLeft aria-hidden className="size-4" /> : <ArrowUpRight aria-hidden className="size-4" />}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate text-aux font-semibold text-foreground">{transaction.description}</p><StatusBadge tone={meta.tone}>{meta.label}</StatusBadge></div><p className="mt-0.5 text-label text-muted">{transaction.bankAccountName} · {formatDate(transaction.occurredOn)}{transaction.externalId ? ` · ${transaction.externalId}` : ''}</p>{evidence ? <p className="mt-1 text-label text-status-positive">Casada com {evidence.invoiceId ? 'fatura' : 'despesa'} · {formatCents(evidence.matchedAmountCents)}{evidence.notes ? ` · ${evidence.notes}` : ''}</p> : null}</div><p className={cn('text-aux font-semibold', transaction.direction === 'credit' ? 'text-status-positive' : 'text-status-negative')}>{transaction.direction === 'credit' ? '+' : '-'} {formatCents(transaction.amountCents)}</p>{canMutate && transaction.status === 'pending' ? <Button variant="secondary" onClick={() => onReconcile(transaction)} disabled={busy}><Link2 aria-hidden className="size-4" />Conciliar</Button> : null}{buttons.map((to) => <Button key={to} variant="ghost" onClick={() => onChangeStatus(transaction, to)} disabled={busy}>{to === 'ignored' ? <><EyeOff aria-hidden className="size-4" />Ignorar</> : <><Undo2 aria-hidden className="size-4" />Voltar para a fila</>}</Button>)}</div>
}

function AccountsPanel({ accounts, canMutate, busyId, onCreate, onToggle }: { accounts: readonly BankAccountDto[]; canMutate: boolean; busyId: string | null; onCreate: () => void; onToggle: (account: BankAccountDto) => void }) {
  if (accounts.length === 0) return <Card><EmptyState icon={WalletCards} title="Nenhuma conta bancária cadastrada." description="Cadastre uma conta para registrar e conciliar transações." action={<Button onClick={onCreate} disabled={!canMutate}><Plus aria-hidden className="size-4" />Cadastrar conta</Button>} /></Card>
  return <Card className="overflow-hidden"><div className="divide-y divide-border-card">{accounts.map((account) => <div key={account.id} className="flex flex-wrap items-center gap-4 px-4 py-4 sm:px-5"><div className="flex min-w-0 flex-1 items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-field bg-brand-subtle text-link"><Landmark aria-hidden className="size-4" /></span><div className="min-w-0"><p className="truncate text-aux font-semibold text-foreground">{account.name}</p><p className="mt-0.5 truncate text-label text-muted">{[account.bankName, account.lastFour ? `final ${account.lastFour}` : null].filter(Boolean).join(' · ') || 'Sem dados bancários adicionais'}</p></div></div><StatusBadge tone={account.isActive ? 'positive' : 'neutral'}>{account.isActive ? 'Ativa' : 'Inativa'}</StatusBadge><Button variant="ghost" onClick={() => onToggle(account)} disabled={!canMutate || busyId === account.id}>{account.isActive ? 'Desativar' : 'Reativar'}</Button></div>)}</div></Card>
}

function formatDate(value: string): string { return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(`${value.slice(0, 10)}T12:00:00`)) }
