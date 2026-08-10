'use client'

import { Info, Pencil, Plus, Star, Trash2, Undo2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { SelectField } from '@/components/ui/select-field'
import { StatusBadge } from '@/components/ui/status-badge'
import { TextField } from '@/components/ui/text-field'
import { formatCents, parseCents } from '@/lib/utils/money'

import { availableServices, isInEffect, sortPriceLists } from '../domain/PriceList'
import {
  priceListMessages,
  type PriceListDto,
  type PriceListFormValues,
} from '../schemas/priceList.schema'
import type { PriceListsPanelProps } from './PriceListsPanel.props'

const emptyForm: PriceListFormValues = { name: '', validFrom: '', validUntil: '' }

/**
 * Tabelas de preço — quanto cada serviço custa, por tabela.
 *
 * # O que liga o catálogo ao convênio
 *
 * `services.default_price_cents` é o particular. Uma clínica que atende
 * convênio cobra valores diferentes pelo mesmo procedimento, e é isto que
 * guarda essa diferença.
 *
 * # O repasse ao profissional não é gerenciado aqui
 *
 * `price_list_items` tem percentual **e** valor em centavos, e nada declara
 * qual vence. Escolher seria adivinhar um número que vira dinheiro no bolso de
 * alguém. A tela diz isso em vez de omitir em silêncio.
 */
export function PriceListsPanel({
  lists,
  services,
  onSubmitList,
  onSetActive,
  onSetDefault,
  onSetItemPrice,
  onRemoveItem,
  canManage,
  isLive,
  loadError = null,
}: PriceListsPanelProps) {
  const router = useRouter()
  const [listModalOpen, setListModalOpen] = useState(false)
  const [editing, setEditing] = useState<PriceListDto | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [newServiceId, setNewServiceId] = useState('')
  const [newPrice, setNewPrice] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const editable = canManage && isLive && !loadError
  const ordered = useMemo(() => sortPriceLists(lists), [lists])
  const selected = ordered.find((list) => list.id === selectedId) ?? ordered[0] ?? null
  const now = new Date()

  const selectable = selected
    ? availableServices(
        services,
        selected.items.map((item) => ({ ...item })),
      )
    : []

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setError(null)
    setListModalOpen(true)
  }

  function openEdit(list: PriceListDto) {
    setEditing(list)
    setForm({
      name: list.name,
      validFrom: list.validFrom ? list.validFrom.slice(0, 10) : '',
      validUntil: list.validUntil ? list.validUntil.slice(0, 10) : '',
    })
    setError(null)
    setListModalOpen(true)
  }

  function closeList(force = false) {
    if (saving && !force) return
    setListModalOpen(false)
    setEditing(null)
    setForm(emptyForm)
    setError(null)
  }

  async function submitList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (form.name.trim().length < 2) {
      setError(priceListMessages.nameRequired)
      return
    }
    if (
      form.validFrom &&
      form.validUntil &&
      new Date(form.validFrom).getTime() > new Date(form.validUntil).getTime()
    ) {
      setError(priceListMessages.windowInverted)
      return
    }

    setSaving(true)
    try {
      const failure = await onSubmitList(form, editing?.id ?? null)
      if (failure) {
        setError(failure)
        return
      }
      closeList(true)
      router.refresh()
    } catch {
      setError(priceListMessages.unavailable)
    } finally {
      setSaving(false)
    }
  }

  async function run(id: string, operation: () => Promise<string | null>) {
    setBusyId(id)
    setError(null)
    try {
      const failure = await operation()
      if (failure) setError(failure)
      else router.refresh()
    } catch {
      setError(priceListMessages.unavailable)
    } finally {
      setBusyId(null)
    }
  }

  async function addItem() {
    if (!selected || !newServiceId) {
      setError(priceListMessages.serviceRequired)
      return
    }
    const cents = parseCents(newPrice)
    if (cents === null || cents < 0) {
      setError(priceListMessages.priceInvalid)
      return
    }

    await run(selected.id, () => onSetItemPrice(selected.id, newServiceId, cents))
    setNewServiceId('')
    setNewPrice('')
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Tabelas de preço"
        description="O que a clínica cobra por serviço, além do particular do catálogo."
        action={
          <Button onClick={openCreate} disabled={!editable}>
            <Plus aria-hidden className="size-4" />
            Nova tabela
          </Button>
        }
        className="border-b border-border-card"
      />

      {loadError ? (
        <div
          role="alert"
          className="m-4 rounded-card border border-status-negative/25 bg-status-negative-surface px-4 py-3 text-aux text-status-negative"
        >
          {loadError}
        </div>
      ) : null}

      {error && !listModalOpen ? (
        <div
          role="alert"
          className="m-4 rounded-card border border-status-negative/25 bg-status-negative-surface px-4 py-3 text-aux text-status-negative"
        >
          {error}
        </div>
      ) : null}

      {!isLive ? (
        <div role="status" className="m-4 rounded-card border border-border-card px-4 py-3 text-aux text-muted">
          Modo demonstração: nenhuma tabela fictícia é exibida.
        </div>
      ) : null}

      {ordered.length === 0 && !loadError ? (
        <p className="px-5 py-5 text-aux text-muted">
          Nenhuma tabela cadastrada. O catálogo já guarda o preço particular de cada
          serviço; uma tabela serve para os valores de convênio.
        </p>
      ) : (
        <div className="grid gap-0 md:grid-cols-[minmax(14rem,20rem)_minmax(0,1fr)]">
          <nav aria-label="Tabelas de preço" className="border-b border-border-card md:border-r md:border-b-0">
            <ul className="divide-y divide-border-card">
              {ordered.map((list) => (
                <li key={list.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(list.id)}
                    aria-pressed={selected?.id === list.id}
                    className={
                      selected?.id === list.id
                        ? 'flex w-full flex-col gap-1 bg-brand-subtle px-4 py-3 text-left'
                        : 'flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-row-hover'
                    }
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-aux font-semibold text-foreground">
                        {list.name}
                      </span>
                      {list.isDefault ? (
                        <StatusBadge tone="positive">Padrão</StatusBadge>
                      ) : null}
                      {list.isActive ? null : (
                        <StatusBadge tone="neutral">Desativada</StatusBadge>
                      )}
                    </span>
                    <span className="text-label text-muted">
                      {list.items.length}{' '}
                      {list.items.length === 1 ? 'serviço' : 'serviços'}
                      {/*
                        Vigência é comparação de data. Tabela fora da janela
                        continua visível: quem fatura atendimento antigo
                        precisa dela.
                      */}
                      {isInEffect(
                        {
                          validFrom: list.validFrom ? new Date(list.validFrom) : null,
                          validUntil: list.validUntil ? new Date(list.validUntil) : null,
                        },
                        now,
                      )
                        ? ''
                        : ' · fora da vigência'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <section aria-label="Serviços da tabela" className="min-w-0">
            {selected ? (
              <>
                <div className="flex flex-wrap items-center gap-2 border-b border-border-card px-5 py-3">
                  <p className="flex-1 text-aux font-semibold text-foreground">
                    {selected.name}
                  </p>

                  {editable ? (
                    <>
                      {selected.isDefault ? null : (
                        <Button
                          variant="ghost"
                          onClick={() => void run(selected.id, () => onSetDefault(selected.id))}
                          disabled={busyId === selected.id}
                        >
                          <Star aria-hidden className="size-4" />
                          Tornar padrão
                        </Button>
                      )}
                      <Button variant="ghost" onClick={() => openEdit(selected)}>
                        <Pencil aria-hidden className="size-4" />
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() =>
                          void run(selected.id, () =>
                            onSetActive(selected.id, !selected.isActive),
                          )
                        }
                        disabled={busyId === selected.id}
                      >
                        <Undo2 aria-hidden className="size-4" />
                        {selected.isActive ? 'Desativar' : 'Reativar'}
                      </Button>
                    </>
                  ) : null}
                </div>

                {selected.items.length === 0 ? (
                  <p className="px-5 py-5 text-aux text-muted">
                    Nenhum serviço precificado nesta tabela.
                  </p>
                ) : (
                  <ul className="divide-y divide-border-card">
                    {selected.items.map((item) => (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-center gap-3 px-5 py-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-aux text-foreground">
                            {item.serviceName}
                          </p>
                          {item.serviceCode ? (
                            <p className="text-label text-muted">{item.serviceCode}</p>
                          ) : null}
                        </div>
                        <p className="text-aux font-semibold text-foreground">
                          {formatCents(item.priceCents)}
                        </p>
                        {editable ? (
                          <Button
                            variant="ghost"
                            onClick={() =>
                              void run(selected.id, () => onRemoveItem(selected.id, item.id))
                            }
                            disabled={busyId === selected.id}
                          >
                            <Trash2 aria-hidden className="size-4" />
                            Remover
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}

                {editable ? (
                  <div className="flex flex-wrap items-end gap-2 border-t border-border-card px-5 py-3">
                    {/*
                      Só serviços ainda não precificados: oferecer um que já tem
                      preço abriria a porta para o segundo item, que é
                      justamente o que não pode existir.
                    */}
                    <SelectField
                      label="Serviço"
                      value={newServiceId}
                      onChange={(event) => setNewServiceId(event.target.value)}
                      options={[
                        { value: '', label: 'Escolha um serviço' },
                        ...selectable.map((service) => ({
                          value: service.id,
                          label: service.name,
                        })),
                      ]}
                      className="w-56"
                    />
                    <TextField
                      label="Preço"
                      value={newPrice}
                      onChange={(event) => setNewPrice(event.target.value)}
                      placeholder="R$ 0,00"
                      className="w-40"
                    />
                    <Button
                      variant="secondary"
                      onClick={() => void addItem()}
                      disabled={busyId === selected.id || selectable.length === 0}
                    >
                      <Plus aria-hidden className="size-4" />
                      Adicionar preço
                    </Button>
                  </div>
                ) : null}
              </>
            ) : null}
          </section>
        </div>
      )}

      <p className="flex items-start gap-2.5 border-t border-border-card px-5 py-3.5 text-label text-muted">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        {priceListMessages.shareUnavailable}
      </p>

      <Modal
        open={listModalOpen}
        onOpenChange={(open) => (open ? setListModalOpen(true) : closeList())}
        title={editing ? 'Editar tabela' : 'Nova tabela'}
        description="Nome e vigência. Os preços entram depois, serviço a serviço."
        footer={
          <>
            <Button variant="secondary" onClick={() => closeList()} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" form="price-list-form" isLoading={saving}>
              Salvar tabela
            </Button>
          </>
        }
      >
        <form id="price-list-form" className="flex flex-col gap-4" onSubmit={submitList} noValidate>
          {error ? (
            <div
              role="alert"
              className="rounded-field border border-status-negative/25 bg-status-negative-surface px-3 py-2 text-label text-status-negative"
            >
              {error}
            </div>
          ) : null}

          <TextField
            label="Nome da tabela"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Ex.: Convênio Aurora"
            required
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Vigência a partir de"
              type="date"
              value={form.validFrom}
              onChange={(event) =>
                setForm((current) => ({ ...current, validFrom: event.target.value }))
              }
            />
            <TextField
              label="Vigência até"
              type="date"
              value={form.validUntil}
              onChange={(event) =>
                setForm((current) => ({ ...current, validUntil: event.target.value }))
              }
            />
          </div>

          <p className="text-label text-muted">
            Tornar padrão é uma ação própria: ela tira o padrão da tabela que o tinha,
            e no máximo uma pode ser a padrão.
          </p>
        </form>
      </Modal>
    </Card>
  )
}
