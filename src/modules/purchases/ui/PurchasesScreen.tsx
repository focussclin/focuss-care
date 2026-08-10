'use client'

import {
  ArchiveRestore,
  ClipboardList,
  Edit3,
  PackageCheck,
  Plus,
  RotateCcw,
  Search,
  ShieldAlert,
  ShoppingCart,
  Truck,
  UsersRound,
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

import {
  purchaseMessages,
  type PurchaseOrderDto,
  type PurchaseOrderFormValues,
  type PurchaseOrderStatus,
  type PurchaseSupplierDto,
  type PurchaseSupplierFormValues,
} from '../schemas/purchase.schema'
import type { PurchasesScreenProps } from './PurchaseScreen.props'

type View = 'orders' | 'suppliers'
type OrderStatusFilter = 'all' | PurchaseOrderStatus

interface SupplierFormState {
  name: string
  taxId: string
  email: string
  phone: string
  notes: string
}

interface OrderLineState {
  inventoryItemId: string
  quantity: string
  unitCost: string
}

interface OrderFormState {
  supplierId: string
  expectedDeliveryDate: string
  notes: string
  items: OrderLineState[]
}

const emptySupplier: SupplierFormState = {
  name: '',
  taxId: '',
  email: '',
  phone: '',
  notes: '',
}

const emptyOrder: OrderFormState = {
  supplierId: '',
  expectedDeliveryDate: '',
  notes: '',
  items: [],
}

const statusMeta: Record<
  PurchaseOrderStatus,
  { label: string; tone: StatusTone; action?: PurchaseOrderStatus; actionLabel?: string }
> = {
  draft: { label: 'Rascunho', tone: 'neutral', action: 'requested', actionLabel: 'Enviar para aprovação' },
  requested: { label: 'Solicitado', tone: 'pending', action: 'approved', actionLabel: 'Aprovar pedido' },
  approved: { label: 'Aprovado', tone: 'positive', action: 'ordered', actionLabel: 'Marcar como enviado' },
  ordered: { label: 'Pedido enviado', tone: 'positive', actionLabel: 'Registrar recebimento' },
  partially_received: { label: 'Recebimento parcial', tone: 'pending', actionLabel: 'Continuar recebimento' },
  received: { label: 'Recebido', tone: 'positive' },
  cancelled: { label: 'Cancelado', tone: 'negative' },
}

export function PurchasesScreen({
  suppliers,
  catalog,
  orders,
  onSubmitSupplier,
  onToggleSupplier,
  onSubmitOrder,
  onTransitionOrder,
  onReceiveOrderItem,
  isLive,
  schemaPending = false,
}: PurchasesScreenProps) {
  const router = useRouter()
  const [view, setView] = useState<View>('orders')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<OrderStatusFilter>('all')
  const [supplierModalOpen, setSupplierModalOpen] = useState(false)
  const [editingSupplier, setEditingSupplier] = useState<PurchaseSupplierDto | null>(null)
  const [supplierForm, setSupplierForm] = useState<SupplierFormState>(emptySupplier)
  const [orderModalOpen, setOrderModalOpen] = useState(false)
  const [orderForm, setOrderForm] = useState<OrderFormState>(emptyOrder)
  const [receiving, setReceiving] = useState<{ order: PurchaseOrderDto; itemId: string } | null>(null)
  const [receiveQuantity, setReceiveQuantity] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const canMutate = isLive && !schemaPending
  const activeSuppliers = suppliers.filter((supplier) => supplier.isActive)
  const visibleOrders = useMemo(() => {
    const term = search.trim().toLowerCase()
    return orders.filter((order) => {
      if (statusFilter !== 'all' && order.status !== statusFilter) return false
      if (!term) return true
      return order.supplier.name.toLowerCase().includes(term) || order.id.toLowerCase().includes(term)
    })
  }, [orders, search, statusFilter])

  const totalOpen = orders.filter((order) => !['received', 'cancelled'].includes(order.status)).length
  const totalReceiving = orders.filter((order) => ['ordered', 'partially_received'].includes(order.status)).length
  const totalSpend = orders.reduce((sum, order) => sum + order.totalCents, 0)

  function openCreateSupplier() {
    setEditingSupplier(null)
    setSupplierForm(emptySupplier)
    setError(null)
    setSupplierModalOpen(true)
  }

  function openEditSupplier(supplier: PurchaseSupplierDto) {
    setEditingSupplier(supplier)
    setSupplierForm({
      name: supplier.name,
      taxId: supplier.taxId ?? '',
      email: supplier.email ?? '',
      phone: supplier.phone ?? '',
      notes: supplier.notes ?? '',
    })
    setError(null)
    setSupplierModalOpen(true)
  }

  function openCreateOrder() {
    setOrderForm({ ...emptyOrder, supplierId: activeSuppliers[0]?.id ?? '' })
    setError(null)
    setOrderModalOpen(true)
  }

  function closeModals(force = false) {
    if (saving && !force) return
    setSupplierModalOpen(false)
    setOrderModalOpen(false)
    setEditingSupplier(null)
    setReceiving(null)
    setSupplierForm(emptySupplier)
    setOrderForm(emptyOrder)
    setReceiveQuantity('')
    setError(null)
  }

  async function submitSupplier(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (supplierForm.name.trim().length < 2) {
      setError(purchaseMessages.nameRequired)
      return
    }
    if (supplierForm.email && !/^\S+@\S+\.\S+$/.test(supplierForm.email)) {
      setError(purchaseMessages.emailInvalid)
      return
    }
    setSaving(true)
    try {
      const values: PurchaseSupplierFormValues = supplierForm
      const failure = await onSubmitSupplier(values, editingSupplier?.id ?? null)
      if (failure) {
        setError(failure)
        return
      }
      closeModals(true)
      router.refresh()
    } catch {
      setError(purchaseMessages.unavailable)
    } finally {
      setSaving(false)
    }
  }

  async function submitOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    if (!orderForm.supplierId) {
      setError(purchaseMessages.supplierInvalid)
      return
    }
    if (orderForm.items.length === 0) {
      setError(purchaseMessages.orderWithoutItems)
      return
    }

    const seen = new Set<string>()
    const items = [] as PurchaseOrderFormValues['items'][number][]
    for (const line of orderForm.items) {
      const quantity = Number(line.quantity)
      const unitCostCents = parseCents(line.unitCost)
      if (!line.inventoryItemId || seen.has(line.inventoryItemId)) {
        setError(purchaseMessages.duplicateItems)
        return
      }
      if (!Number.isInteger(quantity) || quantity < 1) {
        setError(purchaseMessages.quantityInvalid)
        return
      }
      if (unitCostCents === null || unitCostCents < 0) {
        setError(purchaseMessages.costInvalid)
        return
      }
      seen.add(line.inventoryItemId)
      items.push({ inventoryItemId: line.inventoryItemId, quantity, unitCostCents })
    }

    setSaving(true)
    try {
      const failure = await onSubmitOrder({
        supplierId: orderForm.supplierId,
        expectedDeliveryDate: orderForm.expectedDeliveryDate,
        notes: orderForm.notes,
        items,
      })
      if (failure) {
        setError(failure)
        return
      }
      closeModals(true)
      router.refresh()
    } catch {
      setError(purchaseMessages.unavailable)
    } finally {
      setSaving(false)
    }
  }

  async function changeStatus(order: PurchaseOrderDto, status: PurchaseOrderStatus) {
    setError(null)
    setBusyId(order.id)
    try {
      const failure = await onTransitionOrder(order.id, status)
      if (failure) setError(failure)
      else router.refresh()
    } catch {
      setError(purchaseMessages.unavailable)
    } finally {
      setBusyId(null)
    }
  }

  async function toggleSupplier(supplier: PurchaseSupplierDto) {
    setError(null)
    setBusyId(supplier.id)
    try {
      const failure = await onToggleSupplier(supplier.id, !supplier.isActive)
      if (failure) setError(failure)
      else router.refresh()
    } catch {
      setError(purchaseMessages.unavailable)
    } finally {
      setBusyId(null)
    }
  }

  async function receiveItem() {
    if (!receiving) return
    const quantity = Number(receiveQuantity)
    const item = receiving.order.items.find((line) => line.id === receiving.itemId)
    if (!item || !Number.isInteger(quantity) || quantity < 1 || quantity > item.quantity - item.receivedQuantity) {
      setError(purchaseMessages.receiveQuantityInvalid)
      return
    }
    setError(null)
    setSaving(true)
    try {
      const failure = await onReceiveOrderItem(item.id, quantity)
      if (failure) {
        setError(failure)
        return
      }
      closeModals(true)
      router.refresh()
    } catch {
      setError(purchaseMessages.unavailable)
    } finally {
      setSaving(false)
    }
  }

  function addOrderLine() {
    const used = new Set(orderForm.items.map((line) => line.inventoryItemId))
    const next = catalog.find((item) => !used.has(item.id))
    if (!next) return
    setOrderForm((current) => ({
      ...current,
      items: [...current.items, { inventoryItemId: next.id, quantity: '1', unitCost: '' }],
    }))
  }

  function updateOrderLine(index: number, patch: Partial<OrderLineState>) {
    setOrderForm((current) => ({
      ...current,
      items: current.items.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)),
    }))
  }

  const orderFormTotal = orderForm.items.reduce((sum, line) => {
    const quantity = Number(line.quantity)
    const cost = parseCents(line.unitCost) ?? 0
    return sum + (Number.isInteger(quantity) ? quantity : 0) * cost
  }, 0)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Gestão financeira"
        title="Compras"
        description="Fornecedores, pedidos e recebimentos conectados ao estoque da clínica."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={openCreateSupplier} disabled={!canMutate}>
              <UsersRound aria-hidden className="size-4" />
              Novo fornecedor
            </Button>
            <Button onClick={openCreateOrder} disabled={!canMutate || activeSuppliers.length === 0 || catalog.length === 0}>
              <Plus aria-hidden className="size-4" />
              Nova compra
            </Button>
          </div>
        }
      />

      {schemaPending ? (
        <div role="status" className="flex items-start gap-3 rounded-card border border-status-pending/25 bg-status-pending-surface px-4 py-3 text-aux text-status-pending">
          <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">Compras ainda não conectadas ao banco</p>
            <p className="mt-0.5 text-label">A interface está pronta, mas <code>20260809_purchases.sql</code> precisa ser aplicada depois da migration de Estoque.</p>
          </div>
        </div>
      ) : !isLive ? (
        <div role="status" className="rounded-card border border-border-card bg-surface px-4 py-3 text-aux text-muted">Modo demonstração: nenhum fornecedor ou pedido será salvo sem o Supabase configurado.</div>
      ) : null}

      {error && !supplierModalOpen && !orderModalOpen && !receiving ? (
        <p role="alert" className="rounded-card border border-danger/30 bg-danger-surface px-4 py-3 text-aux text-danger">{error}</p>
      ) : null}

      <div className="grid grid-cols-2 gap-4 nav:grid-cols-4">
        <Metric icon={ShoppingCart} label="Pedidos" value={String(orders.length)} />
        <Metric icon={ClipboardList} label="Em aberto" value={String(totalOpen)} tone="pending" />
        <Metric icon={Truck} label="Aguardando recebimento" value={String(totalReceiving)} tone="positive" />
        <Metric icon={PackageCheck} label="Valor dos pedidos" value={formatCents(totalSpend)} tone="brand" />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-border-card">
        <TabButton active={view === 'orders'} onClick={() => setView('orders')}>Pedidos</TabButton>
        <TabButton active={view === 'suppliers'} onClick={() => setView('suppliers')}>Fornecedores</TabButton>
      </div>

      {view === 'orders' ? (
        <>
          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b border-border-card px-4 py-4 sm:px-5">
              <div className="relative min-w-[220px] flex-1">
                <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <TextField hideLabel label="Buscar pedidos" placeholder="Fornecedor ou ID" value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" />
              </div>
              <div className="w-full sm:w-52">
                <SelectField label="Status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as OrderStatusFilter)} options={[{ value: 'all', label: 'Todos os status' }, ...Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label }))]} />
              </div>
              {(search || statusFilter !== 'all') ? <Button variant="ghost" onClick={() => { setSearch(''); setStatusFilter('all') }}><RotateCcw aria-hidden className="size-4" />Limpar</Button> : null}
            </div>
          </Card>

          {visibleOrders.length === 0 ? (
            <Card><EmptyState icon={ShoppingCart} title={orders.length === 0 ? 'Nenhum pedido cadastrado.' : 'Nenhum pedido encontrado.'} description={orders.length === 0 ? 'Cadastre fornecedores e crie o primeiro pedido ligado ao estoque.' : 'Ajuste a busca ou o filtro de status.'} action={orders.length === 0 ? <Button onClick={openCreateOrder} disabled={!canMutate || activeSuppliers.length === 0 || catalog.length === 0}><Plus aria-hidden className="size-4" />Criar primeiro pedido</Button> : undefined} /></Card>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {visibleOrders.map((order) => <OrderCard key={order.id} order={order} canMutate={canMutate} busy={busyId === order.id} onTransition={changeStatus} onReceive={(itemId) => { setError(null); setReceiving({ order, itemId }); setReceiveQuantity('') }} />)}
            </div>
          )}
        </>
      ) : (
        <SuppliersPanel suppliers={suppliers} canMutate={canMutate} busyId={busyId} onCreate={openCreateSupplier} onEdit={openEditSupplier} onToggle={toggleSupplier} />
      )}

      <Modal open={supplierModalOpen} onOpenChange={(open) => (open ? setSupplierModalOpen(true) : closeModals())} title={editingSupplier ? 'Editar fornecedor' : 'Novo fornecedor'} description="Mantenha os dados de contato prontos para cada pedido." footer={<><Button variant="secondary" onClick={() => closeModals()} disabled={saving}>Cancelar</Button><Button type="submit" form="purchase-supplier-form" isLoading={saving}>Salvar fornecedor</Button></>}>
        <form id="purchase-supplier-form" className="flex flex-col gap-4" onSubmit={submitSupplier}>
          {error && supplierModalOpen ? <p role="alert" className="rounded-field bg-danger-surface px-3 py-2 text-label text-danger">{error}</p> : null}
          <TextField label="Nome do fornecedor" value={supplierForm.name} onChange={(event) => setSupplierForm((current) => ({ ...current, name: event.target.value }))} required />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="CNPJ/CPF (opcional)" value={supplierForm.taxId} onChange={(event) => setSupplierForm((current) => ({ ...current, taxId: event.target.value }))} />
            <TextField label="Telefone (opcional)" value={supplierForm.phone} onChange={(event) => setSupplierForm((current) => ({ ...current, phone: event.target.value }))} />
          </div>
          <TextField label="E-mail (opcional)" type="email" value={supplierForm.email} onChange={(event) => setSupplierForm((current) => ({ ...current, email: event.target.value }))} />
          <TextareaField label="Observações (opcional)" value={supplierForm.notes} onChange={(event) => setSupplierForm((current) => ({ ...current, notes: event.target.value }))} />
        </form>
      </Modal>

      <Modal open={orderModalOpen} onOpenChange={(open) => (open ? setOrderModalOpen(true) : closeModals())} title="Nova compra" description="O pedido começa como rascunho. O total é calculado no banco a partir das linhas." className="sm:w-[min(720px,calc(100vw-2rem))]" footer={<><Button variant="secondary" onClick={() => closeModals()} disabled={saving}>Cancelar</Button><Button type="submit" form="purchase-order-form" isLoading={saving}>Salvar rascunho</Button></>}>
        <form id="purchase-order-form" className="flex flex-col gap-5" onSubmit={submitOrder}>
          {error && orderModalOpen ? <p role="alert" className="rounded-field bg-danger-surface px-3 py-2 text-label text-danger">{error}</p> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Fornecedor" value={orderForm.supplierId} onChange={(event) => setOrderForm((current) => ({ ...current, supplierId: event.target.value }))} options={activeSuppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))} />
            <TextField label="Previsão de entrega (opcional)" type="date" value={orderForm.expectedDeliveryDate} onChange={(event) => setOrderForm((current) => ({ ...current, expectedDeliveryDate: event.target.value }))} />
          </div>
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-aux font-semibold text-foreground">Itens do pedido</p><p className="text-label text-muted">Escolha itens ativos do Estoque e informe o custo unitário.</p></div>
            <Button type="button" variant="secondary" onClick={addOrderLine} disabled={catalog.length === orderForm.items.length}><Plus aria-hidden className="size-4" />Adicionar item</Button>
          </div>
          {orderForm.items.length === 0 ? <div className="rounded-card border border-dashed border-border-card px-4 py-8 text-center text-label text-muted">Nenhum item adicionado.</div> : <div className="flex flex-col gap-3">{orderForm.items.map((line, index) => <div key={`${index}-${line.inventoryItemId}`} className="grid gap-3 rounded-card border border-border-card p-3 sm:grid-cols-[1fr_110px_150px_auto] sm:items-end"><SelectField label="Item" value={line.inventoryItemId} onChange={(event) => updateOrderLine(index, { inventoryItemId: event.target.value })} options={catalog.filter((item) => item.id === line.inventoryItemId || !orderForm.items.some((other, otherIndex) => otherIndex !== index && other.inventoryItemId === item.id)).map((item) => ({ value: item.id, label: `${item.name} (${item.unit})` }))} /><TextField label="Quantidade" type="number" min={1} value={line.quantity} onChange={(event) => updateOrderLine(index, { quantity: event.target.value })} /><TextField label="Custo unitário" placeholder="R$ 0,00" value={line.unitCost} onChange={(event) => updateOrderLine(index, { unitCost: event.target.value })} /><Button type="button" variant="ghost" aria-label="Remover item" onClick={() => setOrderForm((current) => ({ ...current, items: current.items.filter((_, itemIndex) => itemIndex !== index) }))}>×</Button></div>)}</div>}
          <TextareaField label="Observações (opcional)" value={orderForm.notes} onChange={(event) => setOrderForm((current) => ({ ...current, notes: event.target.value }))} />
          <div className="flex items-center justify-between border-t border-border-card pt-4"><span className="text-label text-muted">Total estimado</span><strong className="text-card-title text-foreground">{formatCents(orderFormTotal)}</strong></div>
        </form>
      </Modal>

      <Modal open={Boolean(receiving)} onOpenChange={(open) => (open ? undefined : closeModals())} title="Registrar recebimento" description="O saldo do Estoque será atualizado atomicamente." footer={<><Button variant="secondary" onClick={() => closeModals()} disabled={saving}>Cancelar</Button><Button onClick={receiveItem} isLoading={saving}>Confirmar recebimento</Button></>}>
        {receiving ? (() => { const item = receiving.order.items.find((line) => line.id === receiving.itemId); if (!item) return null; const remaining = item.quantity - item.receivedQuantity; return <div className="flex flex-col gap-4">{error ? <p role="alert" className="rounded-field bg-danger-surface px-3 py-2 text-label text-danger">{error}</p> : null}<div className="rounded-card border border-border-card bg-row-hover p-4"><p className="text-aux font-semibold text-foreground">{item.inventoryItemName}</p><p className="mt-1 text-label text-muted">Pedido: {item.quantity} {item.inventoryItemUnit} · Recebido: {item.receivedQuantity} · Restante: {remaining}</p></div><TextField label={`Quantidade a receber (máx. ${remaining})`} type="number" min={1} max={remaining} value={receiveQuantity} onChange={(event) => setReceiveQuantity(event.target.value)} /></div> })() : null}
      </Modal>
    </div>
  )
}

function Metric({ icon: Icon, label, value, tone = 'neutral' }: { icon: typeof ShoppingCart; label: string; value: string; tone?: 'neutral' | 'pending' | 'positive' | 'brand' }) {
  return <Card className="flex min-w-0 items-start gap-3 p-4"><span className={cn('flex size-9 shrink-0 items-center justify-center rounded-field', tone === 'brand' ? 'bg-brand-subtle text-link' : tone === 'positive' ? 'bg-status-positive-surface text-status-positive' : tone === 'pending' ? 'bg-status-pending-surface text-status-pending' : 'bg-row-hover text-muted')}><Icon aria-hidden className="size-4" /></span><div className="min-w-0"><p className="truncate text-label text-muted">{label}</p><p className="mt-1 truncate text-card-title font-semibold text-foreground">{value}</p></div></Card>
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return <button type="button" onClick={onClick} className={cn('border-b-2 px-3 py-2 text-aux font-semibold transition-colors', active ? 'border-link text-link' : 'border-transparent text-muted hover:text-foreground')}>{children}</button>
}

function OrderCard({ order, canMutate, busy, onTransition, onReceive }: { order: PurchaseOrderDto; canMutate: boolean; busy: boolean; onTransition: (order: PurchaseOrderDto, status: PurchaseOrderStatus) => void; onReceive: (itemId: string) => void }) {
  const meta = statusMeta[order.status]
  const remainingItems = order.items.filter((item) => item.receivedQuantity < item.quantity)
  const transition = meta.action
  return <Card className="overflow-hidden"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-border-card px-4 py-4 sm:px-5"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><ShoppingCart aria-hidden className="size-4 text-link" /><h2 className="truncate text-aux font-semibold text-foreground">{order.supplier.name}</h2><StatusBadge tone={meta.tone}>{meta.label}</StatusBadge></div><p className="mt-1 text-label text-muted">Pedido {order.id.slice(0, 8)} · criado em {formatDate(order.createdAt)}{order.expectedDeliveryDate ? ` · entrega ${formatDate(order.expectedDeliveryDate)}` : ''}</p></div><p className="text-card-title font-semibold text-foreground">{formatCents(order.totalCents)}</p></div><div className="divide-y divide-border-card">{order.items.length === 0 ? <p className="px-4 py-4 text-label text-muted">As linhas aparecerão após a atualização da página.</p> : order.items.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5"><div className="min-w-0 flex-1"><p className="truncate text-aux font-medium text-foreground">{item.inventoryItemName}</p><p className="text-label text-muted">{item.quantity} {item.inventoryItemUnit} · {formatCents(item.unitCostCents)} por unidade</p></div><span className={cn('text-label font-semibold', item.receivedQuantity === item.quantity ? 'text-status-positive' : 'text-muted')}>{item.receivedQuantity}/{item.quantity} recebido</span>{canMutate && ['ordered', 'partially_received'].includes(order.status) && item.receivedQuantity < item.quantity ? <Button variant="secondary" onClick={() => onReceive(item.id)} disabled={busy}><PackageCheck aria-hidden className="size-4" />Receber</Button> : null}</div>)}</div><div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-card bg-row-hover px-4 py-3 sm:px-5">{order.notes ? <p className="max-w-prose text-label text-muted">{order.notes}</p> : <span className="text-label text-muted">{remainingItems.length ? 'Acompanhe cada recebimento para atualizar o saldo.' : 'Pedido concluído.'}</span>}<div className="flex flex-wrap gap-2">{canMutate && transition && order.status !== 'ordered' && order.status !== 'partially_received' ? <Button variant="secondary" onClick={() => onTransition(order, transition)} disabled={busy}>{meta.actionLabel}</Button> : null}{canMutate && ['draft', 'requested', 'approved', 'ordered'].includes(order.status) ? <Button variant="ghost" onClick={() => onTransition(order, 'cancelled')} disabled={busy}>Cancelar</Button> : null}</div></div></Card>
}

function SuppliersPanel({ suppliers, canMutate, busyId, onCreate, onEdit, onToggle }: { suppliers: readonly PurchaseSupplierDto[]; canMutate: boolean; busyId: string | null; onCreate: () => void; onEdit: (supplier: PurchaseSupplierDto) => void; onToggle: (supplier: PurchaseSupplierDto) => void }) {
  if (suppliers.length === 0) return <Card><EmptyState icon={UsersRound} title="Nenhum fornecedor cadastrado." description="Cadastre os parceiros que abastecem a clínica para criar pedidos." action={<Button onClick={onCreate} disabled={!canMutate}><Plus aria-hidden className="size-4" />Cadastrar fornecedor</Button>} /></Card>
  return <Card className="overflow-hidden"><div className="divide-y divide-border-card">{suppliers.map((supplier) => <div key={supplier.id} className="flex flex-wrap items-center gap-4 px-4 py-4 sm:px-5"><div className="flex min-w-0 flex-1 items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-field bg-brand-subtle text-link"><UsersRound aria-hidden className="size-4" /></span><div className="min-w-0"><p className="truncate text-aux font-semibold text-foreground">{supplier.name}</p><p className="mt-0.5 truncate text-label text-muted">{supplier.email ?? supplier.phone ?? supplier.taxId ?? 'Sem contato adicional'}</p></div></div><StatusBadge tone={supplier.isActive ? 'positive' : 'neutral'}>{supplier.isActive ? 'Ativo' : 'Inativo'}</StatusBadge><div className="flex w-full gap-2 sm:w-auto"><Button variant="secondary" onClick={() => onEdit(supplier)} disabled={!canMutate || busyId === supplier.id}><Edit3 aria-hidden className="size-4" />Editar</Button><Button variant="ghost" onClick={() => onToggle(supplier)} disabled={!canMutate || busyId === supplier.id}>{supplier.isActive ? <ArchiveRestore aria-hidden className="size-4" /> : <RotateCcw aria-hidden className="size-4" />}{supplier.isActive ? 'Arquivar' : 'Reativar'}</Button></div></div>)}</div></Card>
}

function formatDate(value: string): string {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`)
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date)
}
