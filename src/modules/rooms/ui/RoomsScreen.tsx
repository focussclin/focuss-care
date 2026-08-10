'use client'

import {
  ArchiveRestore,
  Building2,
  Edit3,
  Info,
  Plus,
  RotateCcw,
  ShieldAlert,
  Trash2,
  UsersRound,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'

import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Modal } from '@/components/ui/modal'
import { SelectField } from '@/components/ui/select-field'
import { StatusBadge } from '@/components/ui/status-badge'
import { TextareaField } from '@/components/ui/textarea-field'
import { TextField } from '@/components/ui/text-field'

import { roomMessages } from '../schemas/room.schema'
import type {
  RoomDto,
  RoomFormValues,
  RoomKind,
  RoomsScreenProps,
} from './RoomsScreen.props'

const kindMeta: Record<
  RoomKind,
  { label: string; itemLabel: string; description: string; order: number }
> = {
  consultorio: {
    label: 'Consultórios',
    itemLabel: 'Consultório',
    description: 'Ambientes onde os profissionais atendem.',
    order: 0,
  },
  sala_exame: {
    label: 'Salas de exame',
    itemLabel: 'Sala de exame',
    description: 'Espaços destinados a exames e diagnósticos.',
    order: 1,
  },
  sala_procedimento: {
    label: 'Salas de procedimento',
    itemLabel: 'Sala de procedimento',
    description: 'Ambientes para procedimentos e intervenções.',
    order: 2,
  },
  equipamento: {
    label: 'Equipamentos',
    itemLabel: 'Equipamento',
    description: 'Recursos móveis que também podem ser reservados.',
    order: 3,
  },
}

const kindOptions = [
  { value: 'consultorio', label: 'Consultório' },
  { value: 'sala_exame', label: 'Sala de exame' },
  { value: 'sala_procedimento', label: 'Sala de procedimento' },
  { value: 'equipamento', label: 'Equipamento' },
] as const

interface FormState {
  name: string
  kind: RoomKind
  capacity: string
  notes: string
}

const emptyForm: FormState = {
  name: '',
  kind: 'consultorio',
  capacity: '',
  notes: '',
}

export function RoomsScreen({
  groups,
  onSubmit,
  onToggleActive,
  onArchive,
  isLive,
  schemaPending = false,
}: RoomsScreenProps) {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<RoomDto | null>(null)
  const [confirming, setConfirming] = useState<RoomDto | null>(null)
  const [archiving, setArchiving] = useState<RoomDto | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setSubmitting] = useState(false)
  const [isToggling, setToggling] = useState(false)

  const canMutate = isLive && !schemaPending

  /*
   * O agrupamento saiu daqui, para `application/toRoomGroups`.
   *
   * Ele era um `reduce` sobre a lista crua, com a ordem vindo de um `order`
   * dentro de `kindMeta` — enquanto o JSDoc de `RoomsScreen.props.ts` afirmava
   * "já agrupadas e ordenadas pela rota". A rota só fazia `map(toRoomDto)`.
   *
   * Agora o contrato é verdadeiro: a tela recebe grupos prontos, e a ordem tem
   * teste.
   */
  const totalRooms = groups.reduce((total, group) => total + group.rooms.length, 0)

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setError(null)
    setModalOpen(true)
  }

  function openEdit(room: RoomDto) {
    setEditing(room)
    setForm({
      name: room.name,
      kind: room.kind,
      capacity: room.capacity === null ? '' : String(room.capacity),
      notes: room.notes ?? '',
    })
    setError(null)
    setModalOpen(true)
  }

  function closeForm(force = false) {
    if (isSubmitting && !force) return
    setModalOpen(false)
    setEditing(null)
    setForm(emptyForm)
    setError(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    const capacity = form.capacity.trim() === '' ? null : Number(form.capacity)
    if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1 || capacity > 999)) {
      setError(roomMessages.capacityInvalid)
      return
    }

    setSubmitting(true)
    try {
      const values: RoomFormValues = {
        name: form.name,
        kind: form.kind,
        capacity,
        notes: form.notes,
      }
      const failure = await onSubmit(values, editing?.id ?? null)
      if (failure) {
        setError(failure)
        return
      }

      closeForm()
      router.refresh()
    } catch {
      setError(roomMessages.unavailable)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggle() {
    if (!confirming) return

    setToggling(true)
    setError(null)
    try {
      const failure = await onToggleActive(confirming.id, !confirming.isActive)
      if (failure) {
        setError(failure)
        return
      }

      setConfirming(null)
      router.refresh()
    } catch {
      setError(roomMessages.unavailable)
    } finally {
      setToggling(false)
    }
  }

  /**
   * Remoção — devolve a mensagem de erro, ou `null`.
   *
   * É o contrato do `ConfirmDialog`: só o `null` fecha. Uma recusa mantém o
   * diálogo aberto com o motivo, em vez de fechar limpo sobre uma sala que
   * continua no cadastro.
   */
  async function handleArchive(): Promise<string | null> {
    if (!archiving) return null

    const failure = await onArchive(archiving.id)
    if (failure) return failure

    setArchiving(null)
    router.refresh()
    return null
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Operação clínica"
        title="Salas e recursos"
        description="Onde os atendimentos acontecem e o que pode ser reservado."
        actions={
          <Button
            onClick={openCreate}
            disabled={!canMutate}
            title={
              schemaPending
                ? 'A migration do cadastro ainda precisa ser aplicada.'
                : !isLive
                  ? 'Disponível quando o Supabase estiver configurado.'
                  : undefined
            }
          >
            <Plus aria-hidden className="size-4" />
            Nova sala
          </Button>
        }
      />

      {schemaPending ? (
        <div
          role="status"
          className="flex items-start gap-3 rounded-card border border-status-pending/25 bg-status-pending-surface px-4 py-3 text-aux text-status-pending"
        >
          <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-semibold">Cadastro ainda não conectado ao banco</p>
            <p className="mt-0.5 text-label">
              A interface está pronta, mas a migration <code>20260809_rooms.sql</code> ainda precisa ser aplicada no projeto Supabase antes de salvar salas.
            </p>
          </div>
        </div>
      ) : !isLive ? (
        <div
          role="status"
          className="rounded-card border border-border-card bg-surface px-4 py-3 text-aux text-muted"
        >
          Modo demonstração: os recursos abaixo são exemplos e nenhuma alteração é salva.
        </div>
      ) : null}

      {error && !modalOpen && !confirming ? (
        <p
          role="alert"
          className="rounded-card border border-danger/30 bg-danger-surface px-4 py-3 text-aux text-danger"
        >
          {error}
        </p>
      ) : null}

      {totalRooms === 0 ? (
        <Card>
          <EmptyState
            icon={Building2}
            title="Nenhuma sala cadastrada."
            description="Cadastre os ambientes e equipamentos para organizar reservas na agenda."
            action={
              <Button onClick={openCreate} disabled={!canMutate}>
                <Plus aria-hidden className="size-4" />
                Cadastrar primeira sala
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-5">
          {groups.map(({ kind, rooms: items }) => {
            const meta = kindMeta[kind]
            return (
              <section key={kind} aria-labelledby={`rooms-${kind}`}>
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h2 id={`rooms-${kind}`} className="text-body font-semibold text-foreground">
                      {meta.label}
                    </h2>
                    <p className="text-label text-muted">{meta.description}</p>
                  </div>
                  <span className="text-label text-muted">
                    {items.length} {items.length === 1 ? 'recurso' : 'recursos'}
                  </span>
                </div>

                <Card className="overflow-hidden">
                  <ul className="divide-y divide-border-card">
                    {items.map((room) => (
                      <li key={room.id} className="flex flex-wrap items-center gap-4 px-4 py-4 sm:px-5">
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-field bg-brand-subtle text-link">
                            {room.kind === 'equipamento' ? (
                              <ArchiveRestore aria-hidden className="size-4" />
                            ) : (
                              <Building2 aria-hidden className="size-4" />
                            )}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-aux font-semibold text-foreground">{room.name}</p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-label text-muted">
                              <span>{kindMeta[room.kind].itemLabel}</span>
                              {room.capacity ? (
                                <span className="inline-flex items-center gap-1 before:content-['·'] before:mr-1">
                                  <UsersRound aria-hidden className="size-3.5" />
                                  Até {room.capacity} {room.capacity === 1 ? 'pessoa' : 'pessoas'}
                                </span>
                              ) : null}
                              {room.notes ? <span className="truncate">{room.notes}</span> : null}
                            </p>
                          </div>
                        </div>

                        <StatusBadge tone={room.isActive ? 'positive' : 'neutral'}>
                          {room.isActive ? 'Ativo' : 'Inativo'}
                        </StatusBadge>

                        <div className="flex w-full items-center gap-2 sm:w-auto">
                          <Button
                            variant="secondary"
                            className="flex-1 sm:flex-none"
                            onClick={() => openEdit(room)}
                            disabled={!canMutate}
                            title={!canMutate ? 'Ação indisponível neste modo.' : undefined}
                          >
                            <Edit3 aria-hidden className="size-4" />
                            Editar
                          </Button>
                          <Button
                            variant="ghost"
                            className="flex-1 sm:flex-none"
                            onClick={() => {
                              setError(null)
                              setConfirming(room)
                            }}
                            disabled={!canMutate || isToggling}
                          >
                            {room.isActive ? (
                              <ArchiveRestore aria-hidden className="size-4" />
                            ) : (
                              <RotateCcw aria-hidden className="size-4" />
                            )}
                            {room.isActive ? 'Desativar' : 'Reativar'}
                          </Button>

                          {/*
                            Remover só aparece para a sala já INATIVA.

                            Não é enfeite de fluxo: desativar é reversível e
                            remover não é. Pôr as duas lado a lado com o mesmo
                            peso convida ao clique errado justamente na que não
                            se desfaz. Quem quer remover desativa antes — e nesse
                            passo já viu o aviso de que o histórico permanece.
                          */}
                          {!room.isActive ? (
                            <Button
                              variant="ghost"
                              className="flex-1 sm:flex-none"
                              onClick={() => {
                                setError(null)
                                setArchiving(room)
                              }}
                              disabled={!canMutate}
                              aria-label={`Remover ${room.name} do cadastro`}
                            >
                              <Trash2 aria-hidden className="size-4" />
                              Remover
                            </Button>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </Card>
              </section>
            )
          })}
        </div>
      )}

      <div className="flex items-start gap-2 text-label text-muted">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <p>Esta tela configura recursos. A ocupação e os conflitos aparecem na Agenda quando uma sala é vinculada ao atendimento.</p>
      </div>

      <ConfirmDialog
        open={archiving !== null}
        onOpenChange={(open) => {
          if (!open) setArchiving(null)
        }}
        title="Remover do cadastro"
        description="A sala sai da lista e o nome fica livre de novo."
        confirmLabel="Remover"
        pendingLabel="Removendo…"
        cancelLabel="Manter"
        onConfirm={handleArchive}
      >
        <p className="text-aux leading-6 text-foreground">
          <strong className="font-semibold">{archiving?.name}</strong> sai do
          cadastro e deixa de aparecer aqui.
        </p>

        {/*
          O que a remoção NÃO faz é a metade que evita ligação para o suporte.

          `appointments.room_id` referencia esta linha: apagar de verdade
          quebraria o histórico de onde cada pessoa foi atendida. Por isso a
          linha permanece no banco com `deleted_at`, e quem espera que remover
          limpe rastro precisa saber que não é isso.
        */}
        <p className="rounded-field border border-border-card bg-background px-3.5 py-2.5 text-label leading-5 text-muted">
          Os atendimentos que já aconteceram nesta sala continuam no histórico,
          com o registro de onde foram. O que muda é que ela não pode mais ser
          escolhida — e o nome volta a ficar disponível para uma sala nova.
        </p>
      </ConfirmDialog>

      <Modal
        open={modalOpen}
        onOpenChange={(open) => (open ? setModalOpen(true) : closeForm())}
        title={editing ? 'Editar sala ou recurso' : 'Nova sala ou recurso'}
        description="O nome precisa ser único dentro da clínica."
        footer={
          <>
            <Button variant="secondary" onClick={() => closeForm()} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button type="submit" form="room-form" isLoading={isSubmitting}>
              {isSubmitting
                ? 'Salvando…'
                : editing
                  ? 'Salvar alterações'
                  : 'Salvar recurso'}
            </Button>
          </>
        }
      >
        <form id="room-form" noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error ? (
            <p role="alert" className="rounded-card border border-danger/30 bg-danger-surface px-3.5 py-2.5 text-aux text-danger">
              {error}
            </p>
          ) : null}

          <TextField
            label="Nome"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Consultório 1, Sala de exames…"
            maxLength={80}
            required
            autoFocus
          />

          <SelectField
            label="Tipo"
            value={form.kind}
            onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value as RoomKind }))}
            options={kindOptions}
            required
          />

          <TextField
            label="Capacidade"
            value={form.capacity}
            onChange={(event) => setForm((current) => ({ ...current, capacity: event.target.value }))}
            hint="Opcional. Para equipamentos, deixe em branco."
            type="number"
            min={1}
            max={999}
            step={1}
            inputMode="numeric"
          />

          <TextareaField
            label="Observações"
            value={form.notes}
            onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
            hint="Opcional. Ex.: andar, acessibilidade ou equipamento disponível."
            maxLength={500}
            rows={3}
          />
        </form>
      </Modal>

      <Modal
        open={Boolean(confirming)}
        onOpenChange={(open) => {
          if (!open && !isToggling) setConfirming(null)
        }}
        title={confirming?.isActive ? 'Desativar recurso?' : 'Reativar recurso?'}
        description={confirming?.name}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(null)} disabled={isToggling}>
              Cancelar
            </Button>
            <Button
              variant={confirming?.isActive ? 'danger' : 'primary'}
              onClick={handleToggle}
              isLoading={isToggling}
            >
              {confirming?.isActive ? 'Desativar recurso' : 'Reativar recurso'}
            </Button>
          </>
        }
      >
        {error ? (
          <p role="alert" className="mb-4 rounded-card border border-danger/30 bg-danger-surface px-3.5 py-2.5 text-aux text-danger">
            {error}
          </p>
        ) : null}
        <p className="text-aux leading-6 text-muted">
          {confirming?.isActive
            ? 'O recurso deixará de aparecer como opção para novos agendamentos. Atendimentos já registrados continuam preservados no histórico.'
            : 'O recurso voltará a aparecer como opção para novos agendamentos.'}
        </p>
      </Modal>
    </div>
  )
}
