'use client'

import {
  ArchiveRestore,
  ArrowDownToLine,
  ArrowUpFromLine,
  Box,
  ClipboardCheck,
  Edit3,
  Info,
  PackageOpen,
  Plus,
  Scale,
  Search,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, type FormEvent } from 'react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Modal } from '@/components/ui/modal'
import { SelectField } from '@/components/ui/select-field'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { TextareaField } from '@/components/ui/textarea-field'
import { TextField } from '@/components/ui/text-field'

import type { InventoryMovementType, StockLevel } from '../domain/Inventory'
import { needsRestock, stockLevelOf } from '../domain/Inventory'
import type { InventoryItemDto } from '../schemas/inventory.schema'
import { inventoryMessages } from '../schemas/inventory.schema'
import type { InventoryScreenProps } from './InventoryScreen.props'

type ItemFilter = 'active' | 'all' | 'inactive' | 'restock'

const emptyItem = {
  name: '',
  sku: '',
  unit: 'unidade',
  minimumQuantity: '',
  notes: '',
}

const emptyMovement = {
  itemId: '',
  movementType: 'in' as InventoryMovementType,
  quantity: '',
  unitCostCents: '',
  reason: '',
}

const emptyCount = {
  itemId: '',
  countedQuantity: '',
  reason: '',
}

const stockBadge: Record<StockLevel, { label: string; tone: StatusTone }> = {
  inactive: { label: 'Inativo', tone: 'neutral' },
  'out-of-stock': { label: 'Sem saldo', tone: 'negative' },
  'below-minimum': { label: 'Abaixo do mínimo', tone: 'negative' },
  healthy: { label: 'Saldo saudável', tone: 'positive' },
}

export function InventoryScreen({
  items,
  movements,
  onSubmitItem,
  onToggleItem,
  onRecordMovement,
  onCountItem,
  isLive,
  schemaPending = false,
}: InventoryScreenProps) {
  const router = useRouter()
  const [itemModalOpen, setItemModalOpen] = useState(false)
  const [movementModalOpen, setMovementModalOpen] = useState(false)
  const [countingItem, setCountingItem] = useState<InventoryItemDto | null>(null)
  const [editing, setEditing] = useState<InventoryItemDto | null>(null)
  const [confirming, setConfirming] = useState<InventoryItemDto | null>(null)
  const [itemForm, setItemForm] = useState(emptyItem)
  const [movementForm, setMovementForm] = useState(emptyMovement)
  const [countForm, setCountForm] = useState(emptyCount)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<ItemFilter>('active')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [toggling, setToggling] = useState(false)

  const canMutate = isLive && !schemaPending
  const visibleItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt-BR')
    return items.filter((item) => {
      if (filter === 'active' && !item.isActive) return false
      if (filter === 'inactive' && item.isActive) return false
      if (filter === 'restock' && !needsRestock(item)) return false
      if (!query) return true
      return [item.name, item.sku ?? ''].some((value) =>
        value.toLocaleLowerCase('pt-BR').includes(query),
      )
    })
  }, [filter, items, search])

  const modalOpen = itemModalOpen || movementModalOpen || Boolean(countingItem) || Boolean(confirming)
  const restockCount = items.filter(needsRestock).length
  const totalUnits = items.reduce((sum, item) => sum + item.currentQuantity, 0)

  function openCreate() {
    setEditing(null)
    setItemForm(emptyItem)
    setError(null)
    setItemModalOpen(true)
  }

  function openEdit(item: InventoryItemDto) {
    setEditing(item)
    setItemForm({
      name: item.name,
      sku: item.sku ?? '',
      unit: item.unit,
      minimumQuantity: String(item.minimumQuantity),
      notes: item.notes ?? '',
    })
    setError(null)
    setItemModalOpen(true)
  }

  function openMovement(item: InventoryItemDto) {
    setMovementForm({ ...emptyMovement, itemId: item.id })
    setError(null)
    setMovementModalOpen(true)
  }

  function openCount(item: InventoryItemDto) {
    /*
     * O campo nasce VAZIO, e não com o saldo atual.
     *
     * Preencher com o saldo transforma "Salvar" em um confirma-o-que-já-está —
     * a pessoa contaria a prateleira e, na dúvida, aceitaria o número sugerido.
     * A contagem só vale se vier da prateleira.
     */
    setCountForm({ ...emptyCount, itemId: item.id })
    setError(null)
    setNotice(null)
    setCountingItem(item)
  }

  function closeModals(force = false) {
    if (saving && !force) return
    setItemModalOpen(false)
    setMovementModalOpen(false)
    setCountingItem(null)
    setEditing(null)
    setConfirming(null)
    setItemForm(emptyItem)
    setMovementForm(emptyMovement)
    setCountForm(emptyCount)
    setError(null)
  }

  async function submitItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const minimumQuantity = itemForm.minimumQuantity.trim() === '' ? 0 : Number(itemForm.minimumQuantity)
    if (!Number.isInteger(minimumQuantity) || minimumQuantity < 0) {
      setError(inventoryMessages.minimumInvalid)
      return
    }
    setSaving(true)
    try {
      const failure = await onSubmitItem({ ...itemForm, minimumQuantity }, editing?.id ?? null)
      if (failure) {
        setError(failure)
        return
      }
      closeModals(true)
      router.refresh()
    } catch {
      setError(inventoryMessages.unavailable)
    } finally {
      setSaving(false)
    }
  }

  async function submitMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const quantity = Number(movementForm.quantity)
    const unitCostCents = movementForm.unitCostCents.trim() === '' ? null : Number(movementForm.unitCostCents)
    if (!Number.isInteger(quantity) || quantity < 1) {
      setError(inventoryMessages.quantityInvalid)
      return
    }
    if (unitCostCents !== null && (!Number.isInteger(unitCostCents) || unitCostCents < 0)) {
      setError(inventoryMessages.costInvalid)
      return
    }
    setSaving(true)
    try {
      const failure = await onRecordMovement({
        itemId: movementForm.itemId,
        movementType: movementForm.movementType,
        quantity,
        unitCostCents,
        reason: movementForm.reason,
      })
      if (failure) {
        setError(failure)
        return
      }
      closeModals(true)
      router.refresh()
    } catch {
      setError(inventoryMessages.unavailable)
    } finally {
      setSaving(false)
    }
  }

  async function submitCount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setNotice(null)
    const countedQuantity = Number(countForm.countedQuantity)
    if (countForm.countedQuantity.trim() === '' || !Number.isInteger(countedQuantity) || countedQuantity < 0) {
      setError(inventoryMessages.countedInvalid)
      return
    }
    setSaving(true)
    try {
      const outcome = await onCountItem({
        itemId: countForm.itemId,
        countedQuantity,
        reason: countForm.reason,
      })
      if (outcome.status === 'error') {
        setError(outcome.message)
        return
      }
      // Conferência que bateu é sucesso, e vai para o `role="status"` — nunca
      // para o bloco de erro.
      if (outcome.status === 'unchanged') setNotice(inventoryMessages.countMatchesBalance)
      closeModals(true)
      router.refresh()
    } catch {
      setError(inventoryMessages.unavailable)
    } finally {
      setSaving(false)
    }
  }

  async function confirmToggle() {
    if (!confirming || toggling) return
    setToggling(true)
    setError(null)
    try {
      const failure = await onToggleItem(confirming.id, !confirming.isActive)
      if (failure) {
        setError(failure)
        return
      }
      closeModals(true)
      router.refresh()
    } catch {
      setError(inventoryMessages.unavailable)
    } finally {
      setToggling(false)
    }
  }

  const itemById = new Map(items.map((item) => [item.id, item]))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Operação"
        title="Estoque"
        description="Controle insumos, saldos mínimos e movimentações da clínica."
        actions={
          <Button onClick={openCreate} disabled={!canMutate}>
            <Plus aria-hidden className="size-4" />
            Novo item
          </Button>
        }
      />

      <div className="flex items-start gap-2.5 rounded-card border border-status-pending/25 bg-status-pending-surface px-4 py-3 text-aux text-status-pending">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
        <p>
          {schemaPending
            ? 'A migration de estoque ainda não foi aplicada. A gravação fica bloqueada até o banco ser atualizado.'
            : isLive
              ? 'Entradas e saídas atualizam o saldo dentro de uma operação atômica no banco.'
              : 'Modo demonstração: nenhum item fictício foi carregado e as movimentações estão desabilitadas.'}
        </p>
      </div>

      {/*
        O erro só fica na página quando NENHUM modal está aberto.

        O Radix marca o resto do documento com `aria-hidden` enquanto o diálogo
        vive, e o overlay ainda cobre tudo com desfoque. Como as gravações que
        falham mantêm o modal aberto de propósito — para a pessoa corrigir sem
        redigitar —, a mensagem ficava atrás do overlay e fora da árvore de
        acessibilidade: o botão "Salvar" parecia não fazer nada.
      */}
      {modalOpen ? null : <ErrorNote message={error} />}

      {notice ? (
        <div role="status" className="rounded-card border border-status-positive/25 bg-status-positive-surface px-4 py-3 text-aux text-status-positive">
          {notice}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4 nav:grid-cols-4">
        <Kpi label="Itens ativos" value={String(items.filter((item) => item.isActive).length)} />
        <Kpi label="Unidades em saldo" value={String(totalUnits)} />
        <Kpi label="Precisam de reposição" value={String(restockCount)} tone={restockCount > 0 ? 'danger' : undefined} />
        <Kpi label="Movimentações recentes" value={String(movements.length)} />
      </div>

      <Card>
        <CardHeader
          title="Itens cadastrados"
          description="O saldo é atualizado por entradas e saídas registradas."
          action={
            <div className="flex flex-wrap items-center gap-2">
              <TextField
                label="Buscar item"
                hideLabel
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nome ou SKU"
                trailing={<Search aria-hidden className="size-4 text-muted" />}
                className="h-11 w-48"
              />
              <SelectField
                label="Filtro"
                hideLabel
                options={[
                  { value: 'active', label: 'Ativos' },
                  { value: 'restock', label: 'Repor' },
                  { value: 'all', label: 'Todos' },
                  { value: 'inactive', label: 'Inativos' },
                ]}
                value={filter}
                onChange={(event) => setFilter(event.target.value as ItemFilter)}
                className="w-32"
              />
            </div>
          }
          className="border-b border-border-card"
        />

        {visibleItems.length === 0 ? (
          <EmptyState
            icon={PackageOpen}
            title={items.length === 0 ? 'Nenhum item cadastrado' : filter === 'restock' && !search.trim() ? 'Nada para repor' : 'Nenhum item encontrado'}
            description={items.length === 0 ? 'Cadastre o primeiro insumo para acompanhar o saldo.' : filter === 'restock' && !search.trim() ? 'Todos os itens ativos estão acima do estoque mínimo.' : 'Ajuste a busca ou o filtro para encontrar outro item.'}
            action={items.length === 0 ? <Button onClick={openCreate} disabled={!canMutate}><Plus aria-hidden className="size-4" />Novo item</Button> : undefined}
          />
        ) : (
          <div className="grid gap-3 p-4 nav:grid-cols-2 xl:grid-cols-3">
            {visibleItems.map((item) => (
              <InventoryItemCard
                key={item.id}
                item={item}
                canMutate={canMutate}
                onEdit={() => openEdit(item)}
                onMovement={() => openMovement(item)}
                onCount={() => openCount(item)}
                onToggle={() => setConfirming(item)}
              />
            ))}
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Movimentações recentes" description="Últimas entradas e saídas registradas no banco." />
        {movements.length === 0 ? (
          <p className="px-5 pb-6 text-aux text-muted">Nenhuma movimentação registrada.</p>
        ) : (
          <div className="divide-y divide-border-card">
            {movements.slice(0, 10).map((movement) => {
              const item = itemById.get(movement.itemId)
              const inbound = movement.movementType === 'in'
              // `countedQuantity` só vem preenchido do ajuste por contagem. É o
              // que separa "saíram 3 no atendimento" de "contei e faltavam 3".
              const counted = movement.countedQuantity
              const kind = counted !== null ? (inbound ? 'Ajuste · sobra' : 'Ajuste · falta') : inbound ? 'Entrada' : 'Saída'
              return (
                <div key={movement.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <span className={inbound ? 'flex size-9 items-center justify-center rounded-full bg-status-positive-surface text-status-positive' : 'flex size-9 items-center justify-center rounded-full bg-status-pending-surface text-status-pending'}>
                    {counted !== null ? <ClipboardCheck aria-hidden className="size-4" /> : inbound ? <ArrowDownToLine aria-hidden className="size-4" /> : <ArrowUpFromLine aria-hidden className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-aux font-semibold text-foreground">{item?.name ?? 'Item removido'}</p>
                    <p className="text-label text-muted">{kind} · {counted !== null ? `saldo apurado ${counted}` : movement.reason || 'Sem motivo'} · {formatDate(movement.createdAt)}</p>
                  </div>
                  <span className={inbound ? 'text-control font-semibold text-status-positive' : 'text-control font-semibold text-status-pending'}>{inbound ? '+' : '-'}{movement.quantity}</span>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <Modal open={itemModalOpen} onOpenChange={(open) => (open ? setItemModalOpen(true) : closeModals())} title={editing ? 'Editar item' : 'Novo item'} description="Cadastre o insumo e o alerta de estoque mínimo." footer={<><Button variant="secondary" onClick={() => closeModals()} disabled={saving}>Cancelar</Button><Button type="submit" form="inventory-item-form" isLoading={saving}>Salvar item</Button></>}>
        <form id="inventory-item-form" className="flex flex-col gap-4" onSubmit={submitItem}>
          <ErrorNote message={error} />
          <TextField label="Nome do item" value={itemForm.name} onChange={(event) => setItemForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ex.: Luvas descartáveis" required />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField label="SKU (opcional)" value={itemForm.sku} onChange={(event) => setItemForm((current) => ({ ...current, sku: event.target.value }))} placeholder="Ex.: LUV-001" />
            <TextField label="Unidade" value={itemForm.unit} onChange={(event) => setItemForm((current) => ({ ...current, unit: event.target.value }))} placeholder="unidade" required />
            <TextField label="Estoque mínimo" type="number" min={0} value={itemForm.minimumQuantity} onChange={(event) => setItemForm((current) => ({ ...current, minimumQuantity: event.target.value }))} />
          </div>
          <TextareaField label="Observações" value={itemForm.notes} onChange={(event) => setItemForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Fornecedor, localização ou observação operacional." />
        </form>
      </Modal>

      <Modal open={movementModalOpen} onOpenChange={(open) => (open ? setMovementModalOpen(true) : closeModals())} title="Registrar movimentação" description="O saldo será atualizado atomicamente pelo banco." footer={<><Button variant="secondary" onClick={() => closeModals()} disabled={saving}>Cancelar</Button><Button type="submit" form="inventory-movement-form" isLoading={saving}>Registrar</Button></>}>
        <form id="inventory-movement-form" className="flex flex-col gap-4" onSubmit={submitMovement}>
          <ErrorNote message={error} />
          <SelectField label="Item" options={items.filter((item) => item.isActive).map((item) => ({ value: item.id, label: `${item.name} · ${item.currentQuantity} ${item.unit}` }))} value={movementForm.itemId} onChange={(event) => setMovementForm((current) => ({ ...current, itemId: event.target.value }))} />
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Tipo" options={[{ value: 'in', label: 'Entrada' }, { value: 'out', label: 'Saída' }]} value={movementForm.movementType} onChange={(event) => setMovementForm((current) => ({ ...current, movementType: event.target.value as InventoryMovementType }))} />
            <TextField label="Quantidade" type="number" min={1} value={movementForm.quantity} onChange={(event) => setMovementForm((current) => ({ ...current, quantity: event.target.value }))} required />
          </div>
          <TextField label="Custo unitário em centavos (opcional)" type="number" min={0} value={movementForm.unitCostCents} onChange={(event) => setMovementForm((current) => ({ ...current, unitCostCents: event.target.value }))} hint="Ex.: R$ 12,50 = 1250 centavos." />
          <TextareaField label="Motivo" value={movementForm.reason} onChange={(event) => setMovementForm((current) => ({ ...current, reason: event.target.value }))} placeholder="Compra, consumo, perda ou ajuste operacional." />
        </form>
      </Modal>

      <Modal
        open={Boolean(countingItem)}
        onOpenChange={(open) => (open ? undefined : closeModals())}
        title="Ajustar por contagem"
        description="Informe o saldo apurado na prateleira. A diferença é calculada e gravada pelo banco, na mesma operação."
        footer={<><Button variant="secondary" onClick={() => closeModals()} disabled={saving}>Cancelar</Button><Button type="submit" form="inventory-count-form" isLoading={saving}>Salvar contagem</Button></>}
      >
        <form id="inventory-count-form" className="flex flex-col gap-4" onSubmit={submitCount} noValidate>
          <ErrorNote message={error} />
          <p className="text-aux text-muted">
            {countingItem?.name} · saldo registrado {countingItem?.currentQuantity} {countingItem?.unit}
          </p>
          <TextField
            label="Saldo contado"
            type="number"
            min={0}
            value={countForm.countedQuantity}
            onChange={(event) => setCountForm((current) => ({ ...current, countedQuantity: event.target.value }))}
            hint="Zero é uma contagem válida — é a prateleira vazia."
            required
          />
          <TextareaField
            label="Motivo"
            value={countForm.reason}
            onChange={(event) => setCountForm((current) => ({ ...current, reason: event.target.value }))}
            placeholder="Contagem mensal, vencimento, quebra ou perda."
          />
        </form>
      </Modal>

      <Modal open={Boolean(confirming)} onOpenChange={(open) => (!open ? setConfirming(null) : undefined)} title={confirming?.isActive ? 'Desativar item?' : 'Reativar item?'} description={confirming?.isActive ? 'Itens desativados saem da operação, mas o histórico é preservado.' : 'O item voltará a aparecer para novas movimentações.'} footer={<><Button variant="secondary" onClick={() => setConfirming(null)} disabled={toggling}>Cancelar</Button><Button onClick={() => void confirmToggle()} isLoading={toggling}>{confirming?.isActive ? 'Desativar item' : 'Reativar item'}</Button></>}>
        <ErrorNote message={error} />
        <p className="mt-3 text-aux text-muted">{confirming?.name}</p>
      </Modal>
    </div>
  )
}

function InventoryItemCard({ item, canMutate, onEdit, onMovement, onCount, onToggle }: { item: InventoryItemDto; canMutate: boolean; onEdit: () => void; onMovement: () => void; onCount: () => void; onToggle: () => void }) {
  // Selo e KPI leem a MESMA função do domínio. Eram duas cópias da regra, e
  // nada impedia que discordassem sobre o mesmo item.
  const { label, tone } = stockBadge[stockLevelOf(item)]
  return (
    <div className="flex min-h-[218px] flex-col rounded-card border border-border-card bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-brand-subtle text-link"><Box aria-hidden className="size-5" /></span>
        <StatusBadge tone={tone}>{label}</StatusBadge>
      </div>
      <p className="mt-4 truncate text-control font-semibold text-foreground">{item.name}</p>
      <p className="mt-0.5 text-label text-muted">{item.sku || 'Sem SKU'} · mínimo {item.minimumQuantity} {item.unit}</p>
      <p className="mt-3 text-display-sm font-semibold tracking-[-0.02em] text-foreground">{item.currentQuantity} <span className="text-aux font-medium text-muted">{item.unit}</span></p>
      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        <Button variant="secondary" onClick={onMovement} disabled={!canMutate || !item.isActive}><ArrowDownToLine aria-hidden className="size-4" />Movimentar</Button>
        <Button variant="ghost" onClick={onCount} disabled={!canMutate || !item.isActive}><Scale aria-hidden className="size-4" />Contar</Button>
        <Button variant="ghost" onClick={onEdit} disabled={!canMutate}><Edit3 aria-hidden className="size-4" />Editar</Button>
        <Button variant="ghost" onClick={onToggle} disabled={!canMutate}><ArchiveRestore aria-hidden className="size-4" />{item.isActive ? 'Desativar' : 'Reativar'}</Button>
      </div>
    </div>
  )
}

/** Só um `role="alert"` existe por vez: ou na página, ou dentro do modal aberto. */
function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div role="alert" className="rounded-card border border-status-negative/25 bg-status-negative-surface px-4 py-3 text-aux text-status-negative">
      {message}
    </div>
  )
}

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return <div className="rounded-card border border-border-card bg-surface px-4 py-4 shadow-card"><p className="text-label text-muted">{label}</p><p className={tone === 'danger' ? 'mt-1 text-display-sm font-semibold text-danger' : 'mt-1 text-display-sm font-semibold text-foreground'}>{value}</p></div>
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(new Date(value))
}
