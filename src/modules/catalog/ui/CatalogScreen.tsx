'use client'

import { Pencil, Plus, Search, ShieldCheck, Trash2, Undo2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, type FormEvent } from 'react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Modal } from '@/components/ui/modal'
import { SelectField } from '@/components/ui/select-field'
import { StatusBadge } from '@/components/ui/status-badge'
import { TextareaField } from '@/components/ui/textarea-field'
import { TextField } from '@/components/ui/text-field'
import { formatCents, parseCents } from '@/lib/utils/money'

import {
  DEFAULT_CATALOG_FILTERS,
  filterCatalog,
  sortForCatalog,
  type CatalogFilters,
} from '../domain/Service'
import {
  serviceMessages,
  type ServiceDto,
  type ServiceFormValues,
} from '../schemas/service.schema'
import type { CatalogScreenProps } from './CatalogScreen.props'

interface FormState {
  name: string
  code: string
  tussCode: string
  category: string
  description: string
  defaultDurationMinutes: string
  price: string
  requiresAuthorization: boolean
}

const emptyForm: FormState = {
  name: '',
  code: '',
  tussCode: '',
  category: '',
  description: '',
  defaultDurationMinutes: '',
  price: '',
  requiresAuthorization: false,
}

/**
 * Catálogo de serviços — o que a clínica faz, quanto dura e quanto custa.
 *
 * # O preço não está aqui para todo mundo
 *
 * A matriz é explícita: "`receptionist` não vê valor nenhum". Quem não tem
 * `invoice.read` recebe `defaultPriceCents: null` do SERVIDOR — a coluna não é
 * escondida no CSS, o número não atravessa a fronteira. Nome, código e duração
 * continuam indo, porque sem eles a recepção não marca.
 *
 * # Desativar e excluir são coisas diferentes
 *
 * Desativar é operacional e reversível. Excluir grava `deleted_at` e some do
 * catálogo — mas a linha permanece no banco, porque `invoice_items.service_id`
 * pode apontar para ela.
 */
export function CatalogScreen({
  services,
  onSubmit,
  onSetActive,
  onDelete,
  canManage,
  canSeePrice,
  isLive,
  loadError = null,
}: CatalogScreenProps) {
  const router = useRouter()
  const [filters, setFilters] = useState<CatalogFilters>(DEFAULT_CATALOG_FILTERS)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<ServiceDto | null>(null)
  const [confirming, setConfirming] = useState<ServiceDto | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const editable = canManage && isLive && !loadError

  const categories = useMemo(() => {
    const found = new Set<string>()
    for (const service of services) {
      if (service.category) found.add(service.category)
    }
    return [...found].sort((left, right) => left.localeCompare(right, 'pt-BR'))
  }, [services])

  const visible = useMemo(
    () => sortForCatalog(filterCatalog(services, filters)),
    [filters, services],
  )

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setError(null)
    setModalOpen(true)
  }

  function openEdit(service: ServiceDto) {
    setEditing(service)
    setForm({
      name: service.name,
      code: service.code ?? '',
      tussCode: service.tussCode ?? '',
      category: service.category ?? '',
      description: service.description ?? '',
      defaultDurationMinutes:
        service.defaultDurationMinutes === null ? '' : String(service.defaultDurationMinutes),
      /*
       * Sem `invoice.read` o preço chega nulo, e o campo abre VAZIO — nunca
       * zerado. Zero é um preço, e salvar sem perceber transformaria um serviço
       * de R$ 250 em gratuito.
       */
      price: service.defaultPriceCents === null ? '' : formatCents(service.defaultPriceCents),
      requiresAuthorization: service.requiresAuthorization,
    })
    setError(null)
    setModalOpen(true)
  }

  function close(force = false) {
    if (saving && !force) return
    setModalOpen(false)
    setEditing(null)
    setConfirming(null)
    setForm(emptyForm)
    setError(null)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (form.name.trim().length < 2) {
      setError(serviceMessages.nameRequired)
      return
    }

    const price = form.price.trim() === '' ? 0 : parseCents(form.price)
    if (price === null || price < 0) {
      setError(serviceMessages.priceInvalid)
      return
    }

    const values: ServiceFormValues = {
      name: form.name.trim(),
      code: form.code,
      tussCode: form.tussCode,
      category: form.category,
      description: form.description,
      defaultDurationMinutes: form.defaultDurationMinutes,
      defaultPriceCents: price,
      requiresAuthorization: form.requiresAuthorization,
    }

    setSaving(true)
    try {
      const failure = await onSubmit(values, editing?.id ?? null)
      if (failure) {
        setError(failure)
        return
      }
      close(true)
      router.refresh()
    } catch {
      setError(serviceMessages.unavailable)
    } finally {
      setSaving(false)
    }
  }

  async function run(serviceId: string, operation: () => Promise<string | null>) {
    setBusyId(serviceId)
    setError(null)
    try {
      const failure = await operation()
      if (failure) setError(failure)
      else {
        setConfirming(null)
        router.refresh()
      }
    } catch {
      setError(serviceMessages.unavailable)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Operação"
        title="Catálogo de serviços"
        description="O que a clínica oferece, quanto dura e quanto custa."
        actions={
          <Button onClick={openCreate} disabled={!editable}>
            <Plus aria-hidden className="size-4" />
            Novo serviço
          </Button>
        }
      />

      {loadError ? (
        <div
          role="alert"
          className="rounded-card border border-status-negative/25 bg-status-negative-surface px-4 py-3 text-aux text-status-negative"
        >
          {loadError}
        </div>
      ) : null}

      {error && !modalOpen && !confirming ? (
        <div
          role="alert"
          className="rounded-card border border-status-negative/25 bg-status-negative-surface px-4 py-3 text-aux text-status-negative"
        >
          {error}
        </div>
      ) : null}

      {!isLive ? (
        <div role="status" className="rounded-card border border-border-card bg-surface px-4 py-3 text-aux text-muted">
          Modo demonstração: nenhum serviço fictício é exibido. Um preço inventado aqui
          seria confundido com a tabela real da clínica.
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <CardHeader
          title="Serviços"
          description={
            canSeePrice
              ? 'Preço base do particular. Tabelas por convênio ainda não são geridas aqui.'
              : 'Seu perfil não exibe valores — nome, código e duração seguem disponíveis.'
          }
          action={
            <div className="flex flex-wrap items-center gap-2">
              <TextField
                label="Buscar serviço"
                hideLabel
                value={filters.query}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, query: event.target.value }))
                }
                placeholder="Nome, código ou TUSS"
                trailing={<Search aria-hidden className="size-4 text-muted" />}
                className="h-11 w-52"
              />
              <SelectField
                label="Categoria"
                hideLabel
                value={filters.category}
                onChange={(event) =>
                  setFilters((current) => ({ ...current, category: event.target.value }))
                }
                options={[
                  { value: 'all', label: 'Todas as categorias' },
                  ...categories.map((category) => ({ value: category, label: category })),
                ]}
                className="w-48"
              />
              <SelectField
                label="Situação"
                hideLabel
                value={filters.onlyActive ? 'active' : 'all'}
                onChange={(event) =>
                  setFilters((current) => ({
                    ...current,
                    onlyActive: event.target.value === 'active',
                  }))
                }
                options={[
                  { value: 'active', label: 'Ativos' },
                  { value: 'all', label: 'Todos' },
                ]}
                className="w-32"
              />
            </div>
          }
          className="border-b border-border-card"
        />

        {visible.length === 0 && !loadError ? (
          <EmptyState
            icon={ShieldCheck}
            title={services.length === 0 ? 'Catálogo vazio' : 'Nenhum serviço encontrado'}
            description={
              services.length === 0
                ? 'Cadastre o primeiro serviço para padronizar o que a agenda oferece e o que a fatura cobra.'
                : 'Ajuste a busca, a categoria ou a situação.'
            }
            action={
              services.length === 0 ? (
                <Button onClick={openCreate} disabled={!editable}>
                  <Plus aria-hidden className="size-4" />
                  Novo serviço
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-border-card">
            {visible.map((service) => (
              <li key={service.id} className="flex flex-wrap items-start gap-3 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-aux font-semibold text-foreground">
                      {service.name}
                    </p>
                    {service.isActive ? null : (
                      <StatusBadge tone="neutral">Desativado</StatusBadge>
                    )}
                    {service.requiresAuthorization ? (
                      <StatusBadge tone="pending">Exige autorização</StatusBadge>
                    ) : null}
                  </div>
                  <p className="mt-0.5 text-label text-muted">
                    {[
                      service.code,
                      service.tussCode ? `TUSS ${service.tussCode}` : null,
                      service.category,
                      service.defaultDurationMinutes
                        ? `${service.defaultDurationMinutes} min`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'Sem código, categoria ou duração definidos'}
                  </p>
                </div>

                {/*
                  `null` aqui não é "preço zero": é ausência de permissão, e o
                  número nem chegou do servidor.
                */}
                {service.defaultPriceCents !== null ? (
                  <p className="text-aux font-semibold text-foreground">
                    {formatCents(service.defaultPriceCents)}
                  </p>
                ) : null}

                {editable ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => openEdit(service)}
                      disabled={busyId === service.id}
                    >
                      <Pencil aria-hidden className="size-4" />
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() =>
                        void run(service.id, () => onSetActive(service.id, !service.isActive))
                      }
                      disabled={busyId === service.id}
                    >
                      <Undo2 aria-hidden className="size-4" />
                      {service.isActive ? 'Desativar' : 'Reativar'}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setConfirming(service)}
                      disabled={busyId === service.id}
                    >
                      <Trash2 aria-hidden className="size-4" />
                      Excluir
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onOpenChange={(open) => (open ? setModalOpen(true) : close())}
        title={editing ? 'Editar serviço' : 'Novo serviço'}
        description="Nome e preço base. Tabelas por convênio ainda não são geridas aqui."
        footer={
          <>
            <Button variant="secondary" onClick={() => close()} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" form="service-form" isLoading={saving}>
              Salvar serviço
            </Button>
          </>
        }
      >
        <form id="service-form" className="flex flex-col gap-4" onSubmit={submit} noValidate>
          {error ? (
            <div
              role="alert"
              className="rounded-field border border-status-negative/25 bg-status-negative-surface px-3 py-2 text-label text-status-negative"
            >
              {error}
            </div>
          ) : null}

          <TextField
            label="Nome do serviço"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Ex.: Consulta clínica"
            required
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Código interno (opcional)"
              value={form.code}
              onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))}
              hint="Sobe em maiúsculas; não pode repetir no catálogo."
            />
            <TextField
              label="Código TUSS (opcional)"
              value={form.tussCode}
              onChange={(event) =>
                setForm((current) => ({ ...current, tussCode: event.target.value }))
              }
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              label="Categoria (opcional)"
              value={form.category}
              onChange={(event) =>
                setForm((current) => ({ ...current, category: event.target.value }))
              }
            />
            <TextField
              label="Duração em minutos"
              type="number"
              min={5}
              max={480}
              value={form.defaultDurationMinutes}
              onChange={(event) =>
                setForm((current) => ({ ...current, defaultDurationMinutes: event.target.value }))
              }
            />
            <TextField
              label="Preço base"
              value={form.price}
              onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
              placeholder="R$ 0,00"
            />
          </div>

          <TextareaField
            label="Descrição (opcional)"
            value={form.description}
            onChange={(event) =>
              setForm((current) => ({ ...current, description: event.target.value }))
            }
          />

          <label className="flex items-center gap-2 text-aux text-foreground">
            <input
              type="checkbox"
              checked={form.requiresAuthorization}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  requiresAuthorization: event.target.checked,
                }))
              }
            />
            Exige autorização prévia do convênio
          </label>
        </form>
      </Modal>

      <Modal
        open={Boolean(confirming)}
        onOpenChange={(open) => (open ? undefined : setConfirming(null))}
        title="Excluir serviço?"
        description="Ele sai do catálogo e deixa de aparecer para novas cobranças. Faturas antigas continuam sabendo o que foi cobrado — a linha permanece no banco."
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirming(null)}
              disabled={busyId !== null}
            >
              Cancelar
            </Button>
            <Button
              onClick={() =>
                confirming ? void run(confirming.id, () => onDelete(confirming.id)) : undefined
              }
              isLoading={busyId !== null}
            >
              Excluir serviço
            </Button>
          </>
        }
      >
        {error ? (
          <div
            role="alert"
            className="mb-3 rounded-field border border-status-negative/25 bg-status-negative-surface px-3 py-2 text-label text-status-negative"
          >
            {error}
          </div>
        ) : null}
        <p className="text-aux text-muted">{confirming?.name}</p>
      </Modal>
    </div>
  )
}
