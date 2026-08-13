'use client'

import {
  ArrowRight,
  CalendarClock,
  CircleAlert,
  Edit3,
  Filter,
  Info,
  Mail,
  Phone,
  Plus,
  ShieldAlert,
  UserRound,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, type FormEvent } from 'react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Modal } from '@/components/ui/modal'
import { SelectField } from '@/components/ui/select-field'
import { TextareaField } from '@/components/ui/textarea-field'
import { TextField } from '@/components/ui/text-field'
import { cn } from '@/lib/utils/cn'
import { formatShortDate } from '@/lib/utils/date'

import { formatLeadValue } from '../application/toLeadDto'
import { leadMessages, leadStageOptions, type LeadDto, type LeadFormValues } from '../schemas/lead.schema'
import type { LeadStage } from '../domain/Lead'
import type { LeadsScreenProps } from './LeadsScreen.props'

type StageFilter = 'all' | LeadStage

interface LeadFormState {
  name: string
  phone: string
  email: string
  source: string
  campaign: string
  interest: string
  stage: LeadStage
  potentialValue: string
  nextActionAt: string
  notes: string
  assignedToId: string
}

const emptyForm: LeadFormState = {
  name: '',
  phone: '',
  email: '',
  source: 'manual',
  campaign: '',
  interest: '',
  stage: 'new',
  potentialValue: '',
  nextActionAt: '',
  notes: '',
  assignedToId: '',
}

const stageMeta: Record<
  LeadStage,
  { label: string; description: string; className: string; dotClassName: string }
> = {
  new: {
    label: 'Novo',
    description: 'Ainda não abordados.',
    className: 'border-border-card bg-surface',
    dotClassName: 'bg-brand',
  },
  contacted: {
    label: 'Contatado',
    description: 'Primeiro contato feito.',
    className: 'border-status-pending/25 bg-status-pending-surface',
    dotClassName: 'bg-status-pending',
  },
  qualified: {
    label: 'Qualificado',
    description: 'Interesse confirmado.',
    className: 'border-link/20 bg-brand-subtle',
    dotClassName: 'bg-link',
  },
  scheduled: {
    label: 'Agendamento',
    description: 'Consulta marcada.',
    className: 'border-status-positive/25 bg-status-positive-surface',
    dotClassName: 'bg-status-positive',
  },
  showed: {
    label: 'Compareceu',
    description: 'Veio à clínica.',
    className: 'border-status-positive/25 bg-status-positive-surface',
    dotClassName: 'bg-status-positive',
  },
  converted: {
    label: 'Convertido',
    description: 'Virou paciente.',
    className: 'border-status-positive/25 bg-status-positive-surface',
    dotClassName: 'bg-status-positive',
  },
  lost: {
    label: 'Perdido',
    description: 'Não avançou.',
    className: 'border-danger/20 bg-danger-surface',
    dotClassName: 'bg-danger',
  },
}

const stageOrder: readonly LeadStage[] = [
  'new',
  'contacted',
  'qualified',
  'scheduled',
  'showed',
  'converted',
  'lost',
]

export function LeadsScreen({
  leads,
  assignees,
  onSubmit,
  onMove,
  onConvert,
  isLive,
  schemaPending = false,
}: LeadsScreenProps) {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<LeadDto | null>(null)
  const [form, setForm] = useState<LeadFormState>(emptyForm)
  const [query, setQuery] = useState('')
  const [stageFilter, setStageFilter] = useState<StageFilter>('all')
  const [assigneeFilter, setAssigneeFilter] = useState('all')
  const [error, setError] = useState<string | null>(null)
  const [busyLeadId, setBusyLeadId] = useState<string | null>(null)
  const [isSubmitting, setSubmitting] = useState(false)

  const canMutate = isLive && !schemaPending
  const filteredLeads = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR')
    return leads.filter((lead) => {
      const matchesQuery =
        !normalizedQuery ||
        [lead.name, lead.phone, lead.email, lead.interest, lead.source, lead.campaign]
          .filter(Boolean)
          .some((value) => value?.toLocaleLowerCase('pt-BR').includes(normalizedQuery))
      const matchesStage = stageFilter === 'all' || lead.stage === stageFilter
      const matchesAssignee =
        assigneeFilter === 'all' || lead.assignedTo?.id === assigneeFilter
      return matchesQuery && matchesStage && matchesAssignee
    })
  }, [assigneeFilter, leads, query, stageFilter])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setError(null)
    setModalOpen(true)
  }

  function openEdit(lead: LeadDto) {
    setEditing(lead)
    setForm({
      name: lead.name,
      phone: lead.phone ?? '',
      email: lead.email ?? '',
      source: lead.source,
      campaign: lead.campaign ?? '',
      interest: lead.interest ?? '',
      stage: lead.stage,
      /*
        Centavos -> texto editável com VÍRGULA, como no modal de pagamento.

        `String(cents / 100)` devolvia '12.34' com ponto: `parseCents` aceita as
        duas formas, então nada quebrava — mas a pessoa via ponto decimal aqui e
        vírgula no financeiro, no mesmo produto, em pt-BR.
      */
      potentialValue:
        lead.potentialValueCents === null
          ? ''
          : (lead.potentialValueCents / 100).toFixed(2).replace('.', ','),
      nextActionAt: lead.nextActionAt?.slice(0, 10) ?? '',
      notes: lead.notes ?? '',
      assignedToId: lead.assignedTo?.id ?? '',
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

    const name = form.name.trim()
    const source = form.source.trim()
    const potential = form.potentialValue.trim()
    const potentialValueCents = potential === '' ? null : Math.round(Number(potential) * 100)

    if (name.length < 2) {
      setError(leadMessages.nameRequired)
      return
    }
    if (!source) {
      setError('Informe a origem do lead.')
      return
    }
    if (potentialValueCents !== null && (!Number.isFinite(potentialValueCents) || potentialValueCents < 0)) {
      setError(leadMessages.valueInvalid)
      return
    }

    setSubmitting(true)
    try {
      const values: LeadFormValues = {
        name,
        phone: form.phone.trim(),
        email: form.email.trim(),
        source,
        campaign: form.campaign.trim(),
        interest: form.interest.trim(),
        stage: form.stage,
        potentialValueCents,
        nextActionAt: form.nextActionAt || null,
        notes: form.notes.trim(),
        assignedToId: form.assignedToId || null,
      }
      const failure = await onSubmit(values, editing?.id ?? null)
      if (failure) {
        setError(failure)
        return
      }

      closeForm(true)
      router.refresh()
    } catch {
      setError(leadMessages.unavailable)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleMove(lead: LeadDto, stage: LeadStage) {
    if (stage === lead.stage) return
    setError(null)
    setBusyLeadId(lead.id)
    try {
      const failure = await onMove(lead.id, stage)
      if (failure) {
        setError(failure)
        return
      }
      router.refresh()
    } catch {
      setError(leadMessages.unavailable)
    } finally {
      setBusyLeadId(null)
    }
  }

  /**
   * Conversão — cria uma ficha de PACIENTE, e por isso não é um `onMove`.
   *
   * O sucesso leva a pessoa até a ficha nova, em vez de só recarregar o funil:
   * "convertido" sem mostrar onde o paciente foi parar faria a recepção
   * procurá-lo na lista para confirmar que existe.
   */
  async function handleConvert(lead: LeadDto) {
    setError(null)
    setBusyLeadId(lead.id)

    try {
      const result = await onConvert(lead.id)

      if (!result.ok) {
        setError(result.message)
        return
      }

      router.push(result.patientHref)
    } catch {
      setError(leadMessages.unavailable)
    } finally {
      setBusyLeadId(null)
    }
  }

  const filtersActive = query.trim() !== '' || stageFilter !== 'all' || assigneeFilter !== 'all'

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Relacionamento"
        title="CRM e Leads"
        description="Acompanhe cada oportunidade até ela virar cuidado na clínica."
        actions={
          <Button
            onClick={openCreate}
            disabled={!canMutate}
            title={
              schemaPending
                ? 'A migration do CRM ainda precisa ser aplicada.'
                : !isLive
                  ? 'Disponível quando o Supabase estiver configurado.'
                  : undefined
            }
          >
            <Plus aria-hidden className="size-4" />
            Novo lead
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
            <p className="font-semibold">CRM ainda não conectado ao banco</p>
            <p className="mt-0.5 text-label">
              A interface está pronta, mas a migration{' '}
              <code>20260809_clinic_leads.sql</code> precisa ser aplicada antes de
              salvar leads.
            </p>
          </div>
        </div>
      ) : !isLive ? (
        <div role="status" className="rounded-card border border-border-card bg-surface px-4 py-3 text-aux text-muted">
          Modo demonstração: nenhum lead será salvo sem o Supabase configurado.
        </div>
      ) : null}

      {error && !modalOpen ? (
        <p role="alert" className="rounded-card border border-danger/30 bg-danger-surface px-4 py-3 text-aux text-danger">
          {error}
        </p>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex items-start gap-3 border-b border-border-card px-4 py-4 sm:px-5">
          <Filter aria-hidden className="mt-1 size-4 shrink-0 text-link" />
          <div className="min-w-0">
            <p className="text-aux font-semibold text-foreground">Pipeline comercial</p>
            <p className="mt-0.5 text-label text-muted">Filtre oportunidades e acompanhe a próxima ação.</p>
          </div>
        </div>
        <div className="grid gap-4 px-4 py-4 sm:grid-cols-3 sm:px-5">
          <TextField
            label="Buscar"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nome, telefone ou interesse"
          />
          <SelectField
            label="Etapa"
            value={stageFilter}
            onChange={(event) => setStageFilter(event.target.value as StageFilter)}
            options={[{ value: 'all', label: 'Todas as etapas' }, ...leadStageOptions]}
          />
          <SelectField
            label="Responsável"
            value={assigneeFilter}
            onChange={(event) => setAssigneeFilter(event.target.value)}
            options={[
              { value: 'all', label: 'Toda a equipe' },
              ...assignees.map((assignee) => ({ value: assignee.id, label: assignee.name })),
            ]}
          />
        </div>
        {filtersActive ? (
          <div className="flex items-center justify-between gap-3 border-t border-border-card px-4 py-3 sm:px-5">
            <p className="text-label text-muted">{filteredLeads.length} oportunidades encontradas.</p>
            <Button
              variant="ghost"
              className="h-9 px-3 text-label"
              onClick={() => {
                setQuery('')
                setStageFilter('all')
                setAssigneeFilter('all')
              }}
            >
              Limpar filtros
            </Button>
          </div>
        ) : null}
      </Card>

      {leads.length === 0 ? (
        <Card>
          <EmptyState
            icon={UserRound}
            title="Ainda não há leads."
            description="Cadastre a primeira oportunidade para começar a acompanhar o relacionamento."
            action={
              <Button onClick={openCreate} disabled={!canMutate}>
                <Plus aria-hidden className="size-4" />
                Cadastrar primeiro lead
              </Button>
            }
          />
        </Card>
      ) : filteredLeads.length === 0 ? (
        <Card>
          <EmptyState
            icon={CircleAlert}
            title="Nenhum lead com esses filtros."
            description="Ajuste a busca ou escolha outra etapa para encontrar oportunidades."
          />
        </Card>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max items-start gap-4">
            {stageOrder.map((stage) => {
              const items = filteredLeads.filter((lead) => lead.stage === stage)
              return (
                <section key={stage} className="w-[min(82vw,300px)] shrink-0" aria-labelledby={`leads-${stage}`}>
                  <div className={cn('rounded-t-card border px-3.5 py-3', stageMeta[stage].className)}>
                    <div className="flex items-center justify-between gap-2">
                      <h2 id={`leads-${stage}`} className="flex items-center gap-2 text-aux font-semibold text-foreground">
                        <span className={cn('size-2 rounded-full', stageMeta[stage].dotClassName)} />
                        {stageMeta[stage].label}
                      </h2>
                      <span className="text-label font-semibold text-muted">{items.length}</span>
                    </div>
                    <p className="mt-1 text-label text-muted">{stageMeta[stage].description}</p>
                  </div>
                  <div className="min-h-32 space-y-3 rounded-b-card border border-t-0 border-border-card bg-background/50 p-3">
                    {items.length > 0 ? items.map((lead) => (
                      <LeadCard
                        key={lead.id}
                        lead={lead}
                        busy={busyLeadId === lead.id}
                        /*
                          `lost` fica de fora: a etapa já diz que não há o que
                          converter, e um botão ali convidaria a criar ficha de
                          quem desistiu.
                        */
                        canConvert={canMutate && lead.stage !== 'lost'}
                        onEdit={openEdit}
                        onMove={handleMove}
                        onConvert={handleConvert}
                      />
                    )) : (
                      <p className="py-8 text-center text-label text-muted">Nenhum lead nesta etapa.</p>
                    )}
                  </div>
                </section>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex items-start gap-2 text-label text-muted">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <p>O CRM registra relacionamento. Follow-ups automáticos e mensagens dependem das integrações de comunicação.</p>
      </div>

      <Modal
        open={modalOpen}
        onOpenChange={(open) => (open ? setModalOpen(true) : closeForm())}
        title={editing ? 'Editar lead' : 'Novo lead'}
        description="Registre só o necessário para o próximo contato."
        footer={
          <>
            <Button variant="secondary" onClick={() => closeForm()} disabled={isSubmitting}>Cancelar</Button>
            <Button type="submit" form="lead-form" isLoading={isSubmitting}>
              {isSubmitting ? 'Salvando…' : editing ? 'Salvar alterações' : 'Salvar lead'}
            </Button>
          </>
        }
      >
        <form id="lead-form" noValidate onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error ? <p role="alert" className="rounded-card border border-danger/30 bg-danger-surface px-3.5 py-2.5 text-aux text-danger">{error}</p> : null}
          <TextField
            label="Nome"
            value={form.name}
            onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            placeholder="Nome do paciente ou responsável"
            maxLength={160}
            required
            autoFocus
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Telefone" type="tel" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} placeholder="(11) 90000-0000" maxLength={30} />
            <TextField label="E-mail" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="contato@exemplo.com" maxLength={254} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Origem" value={form.source} onChange={(event) => setForm((current) => ({ ...current, source: event.target.value }))} placeholder="Instagram, indicação…" maxLength={80} required />
            <TextField label="Campanha" value={form.campaign} onChange={(event) => setForm((current) => ({ ...current, campaign: event.target.value }))} placeholder="Opcional" maxLength={120} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Interesse" value={form.interest} onChange={(event) => setForm((current) => ({ ...current, interest: event.target.value }))} placeholder="Ex.: avaliação dermatológica" maxLength={160} />
            <SelectField label="Etapa" value={form.stage} onChange={(event) => setForm((current) => ({ ...current, stage: event.target.value as LeadStage }))} options={leadStageOptions} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Valor potencial (R$)" type="number" min={0} step="0.01" inputMode="decimal" value={form.potentialValue} onChange={(event) => setForm((current) => ({ ...current, potentialValue: event.target.value }))} placeholder="0,00" />
            <TextField label="Próxima ação" type="date" value={form.nextActionAt} onChange={(event) => setForm((current) => ({ ...current, nextActionAt: event.target.value }))} />
          </div>
          <SelectField label="Responsável" value={form.assignedToId} onChange={(event) => setForm((current) => ({ ...current, assignedToId: event.target.value }))} options={[{ value: '', label: 'Sem responsável' }, ...assignees.map((assignee) => ({ value: assignee.id, label: assignee.name }))]} />
          <TextareaField label="Observações" value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} maxLength={2000} rows={4} hint="Contexto administrativo para o próximo contato." />
        </form>
      </Modal>
    </div>
  )
}

function LeadCard({
  lead,
  busy,
  canConvert,
  onEdit,
  onMove,
  onConvert,
}: {
  lead: LeadDto
  busy: boolean
  /** Falso sem banco, com migration pendente, ou em etapa que não converte. */
  canConvert: boolean
  onEdit: (lead: LeadDto) => void
  onMove: (lead: LeadDto, stage: LeadStage) => Promise<void>
  onConvert: (lead: LeadDto) => Promise<void>
}) {
  return (
    <article className="rounded-card border border-border-card bg-surface p-4 shadow-card transition-shadow hover:shadow-raised">
      <div className="flex items-start justify-between gap-3">
        <button type="button" className="min-w-0 text-left" onClick={() => onEdit(lead)} aria-label={`Editar lead ${lead.name}`}>
          <p className="truncate text-aux font-semibold text-foreground">{lead.name}</p>
          {lead.interest ? <p className="mt-1 line-clamp-2 text-label text-muted">{lead.interest}</p> : null}
        </button>
        <Button variant="ghost" className="size-9 shrink-0 !px-0" onClick={() => onEdit(lead)} aria-label={`Editar lead ${lead.name}`}>
          <Edit3 aria-hidden className="size-4" />
        </Button>
      </div>

      <div className="mt-3 flex flex-col gap-2 text-label text-muted">
        {lead.phone ? <a className="inline-flex items-center gap-2 hover:text-link" href={`tel:${lead.phone}`}><Phone aria-hidden className="size-3.5" />{lead.phone}</a> : null}
        {lead.email ? <a className="inline-flex min-w-0 items-center gap-2 truncate hover:text-link" href={`mailto:${lead.email}`}><Mail aria-hidden className="size-3.5 shrink-0" />{lead.email}</a> : null}
        <span className="inline-flex items-center gap-2"><ArrowRight aria-hidden className="size-3.5" />{lead.source === 'manual' ? 'Cadastro manual' : lead.source}</span>
        {/*
          `formatShortDate`, e não `toLocaleDateString`: o produto inteiro
          escreve data curta (12/08), e este era o único lugar que escrevia o ano
          junto — dois formatos na mesma tela fazem o olho tropeçar.
        */}
        {lead.nextActionAt ? <span className="inline-flex items-center gap-2"><CalendarClock aria-hidden className="size-3.5" />Próxima ação: {formatShortDate(new Date(lead.nextActionAt))}</span> : null}
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-border-card pt-3">
        <span className="flex min-w-0 items-center gap-2 text-label text-muted">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-link">
            {lead.assignedTo ? initials(lead.assignedTo.name) : <UserRound aria-hidden className="size-3.5" />}
          </span>
          <span className="truncate">{lead.assignedTo?.name ?? 'Sem responsável'}</span>
        </span>
        {lead.potentialValueCents !== null ? <span className="shrink-0 text-label font-semibold text-foreground">{formatLeadValue(lead.potentialValueCents)}</span> : null}
      </div>

      <SelectField
        label={`Mover ${lead.name}`}
        hideLabel
        value={lead.stage}
        onChange={(event) => void onMove(lead, event.target.value as LeadStage)}
        options={leadStageOptions}
        disabled={busy}
        className="mt-3 h-9 text-label"
      />

      {/*
        A conversão tem três estados, e nenhum deles é um botão sempre visível.

        1. JÁ CONVERTIDO — vira link para a ficha. Um botão "converter" aqui
           criaria a segunda ficha da mesma pessoa, que é o pior desfecho
           possível num cadastro clínico.
        2. CONVERSÍVEL — botão real, que cria paciente de verdade.
        3. NÃO CONVERSÍVEL (`lost`, ou sem banco) — nada. Botão desabilitado
           que nunca habilita é promessa vazia; a etapa "perdido" já diz que
           não há o que converter.
      */}
      {lead.convertedPatientId ? (
        <p className="mt-3 text-label text-muted">
          <Link
            href={`/pacientes/${lead.convertedPatientId}`}
            className="inline-flex items-center gap-1.5 font-semibold text-link hover:underline"
          >
            <UserRound aria-hidden className="size-3.5" />
            Ver ficha do paciente
          </Link>
        </p>
      ) : canConvert ? (
        <Button
          variant="secondary"
          className="mt-3 w-full"
          disabled={busy}
          onClick={() => void onConvert(lead)}
        >
          <UserRound aria-hidden className="size-4" />
          Converter em paciente
        </Button>
      ) : null}
    </article>
  )
}

function initials(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '?'
}
