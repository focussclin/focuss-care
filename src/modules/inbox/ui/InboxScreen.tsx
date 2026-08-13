'use client'

import {
  Bot,
  CheckCheck,
  Inbox as InboxIcon,
  Info,
  MessageCircle,
  Search,
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { SelectField } from '@/components/ui/select-field'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { TextField } from '@/components/ui/text-field'
import { cn } from '@/lib/utils/cn'
import { formatShortDate, formatTime } from '@/lib/utils/date'

import type { ConversationStatus } from '@/lib/supabase/database.types'

import { canChangeStatus, needsReadReset } from '../domain/Inbox'
import { conversationStatusOptions, inboxMessages, type InboxAssigneeOptionDto, type InboxConversationDto, type InboxMessageDto } from '../schemas/inbox.schema'
import type { InboxScreenProps } from './InboxScreen.props'

type StatusFilter = 'all' | InboxConversationDto['status']

const statusMeta: Record<InboxConversationDto['status'], { label: string; tone: StatusTone }> = {
  open: { label: 'Aberta', tone: 'positive' },
  pending: { label: 'Aguardando', tone: 'pending' },
  resolved: { label: 'Resolvida', tone: 'neutral' },
  archived: { label: 'Arquivada', tone: 'neutral' },
}

export function InboxScreen({
  conversations,
  assignees,
  onChangeStatus,
  onAssign,
  onMarkRead,
  isLive,
  loadError = null,
}: InboxScreenProps) {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all')
  const [selectedId, setSelectedId] = useState<string | null>(conversations[0]?.id ?? null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const canMutate = isLive && !loadError

  /*
   * Abrir a conversa zera o contador — mas so quando ha o que zerar.
   *
   * Sem `needsReadReset`, cada clique numa conversa ja lida dispararia um
   * UPDATE: escrita inutil, `updated_at` mexido e a lista reordenando sozinha
   * sem que nada tenha acontecido.
   */
  function select(conversation: InboxConversationDto) {
    setSelectedId(conversation.id)
    if (!canMutate || !needsReadReset(conversation.unreadCount)) return
    void run(() => onMarkRead(conversation.id))
  }

  async function run(operation: () => Promise<string | null>) {
    setError(null)
    try {
      const failure = await operation()
      if (failure) {
        setError(failure)
        return
      }
      startTransition(() => router.refresh())
    } catch {
      setError(inboxMessages.unavailable)
    }
  }

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR')
    return conversations.filter((conversation) => {
      const matchesQuery =
        !normalized ||
        conversation.contactName.toLocaleLowerCase('pt-BR').includes(normalized) ||
        conversation.contactPhone.includes(normalized) ||
        conversation.patientName?.toLocaleLowerCase('pt-BR').includes(normalized)
      const matchesAssignee =
        assigneeFilter === 'all' ||
        (assigneeFilter === 'unassigned'
          ? conversation.assignedTo === null
          : conversation.assignedTo?.id === assigneeFilter)
      return matchesQuery && matchesAssignee && (statusFilter === 'all' || conversation.status === statusFilter)
    })
  }, [assigneeFilter, conversations, query, statusFilter])

  const selected =
    filtered.find((conversation) => conversation.id === selectedId) ?? filtered[0] ?? null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Relacionamento"
        title="Inbox de atendimento"
        description="Converse com pacientes e leads em um só lugar."
      />

      <div className="flex items-start gap-2.5 rounded-card border border-status-pending/25 bg-status-pending-surface px-4 py-3 text-aux text-status-pending">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
        <p>
          {isLive
            ? 'Status, responsável e leitura são gravados no banco. Recebimento e envio de mensagens dependem do provedor de WhatsApp e da ingestão de eventos.'
            : 'Modo demonstração: nenhuma conversa fictícia é exibida. Conecte o Supabase e o provedor para alimentar a Inbox.'}
        </p>
      </div>

      {loadError ? (
        <div role="alert" className="rounded-card border border-status-negative/25 bg-status-negative-surface px-4 py-3 text-aux text-status-negative">
          {loadError}
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="rounded-card border border-status-negative/25 bg-status-negative-surface px-4 py-3 text-aux text-status-negative">
          {error}
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="grid gap-4 border-b border-border-card px-4 py-4 sm:grid-cols-[minmax(0,1fr)_200px_200px] sm:px-5">
          <TextField
            label="Buscar conversa"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nome, telefone ou paciente"
            trailing={<Search aria-hidden className="size-4 text-muted" />}
          />
          <SelectField
            label="Status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
            options={[{ value: 'all', label: 'Todos os status' }, ...conversationStatusOptions]}
          />
          {/*
            "Atribuída a" e não "Responsável": o seletor do detalhe já usa esse
            nome, e dois controles com o mesmo nome acessível na mesma tela — um
            que filtra a lista, outro que grava no banco — é ambiguidade para
            quem navega por leitor de tela e para quem só está com pressa.
          */}
          <SelectField
            label="Atribuída a"
            value={assigneeFilter}
            onChange={(event) => setAssigneeFilter(event.target.value)}
            options={[
              { value: 'all', label: 'Qualquer responsável' },
              { value: 'unassigned', label: 'Sem responsável' },
              ...assignees.map((assignee) => ({ value: assignee.id, label: assignee.name })),
            ]}
          />
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={InboxIcon}
            title={conversations.length === 0 ? 'Ainda não há conversas.' : 'Nenhuma conversa encontrada.'}
            description={
              conversations.length === 0
                ? 'Quando a integração receber uma mensagem, a conversa aparece aqui.'
                : 'Ajuste a busca ou o filtro de status.'
            }
          />
        ) : (
          <div className="grid min-h-[34rem] md:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
            <nav aria-label="Conversas" className="border-b border-border-card md:border-r md:border-b-0">
              <ul className="divide-y divide-border-card">
                {filtered.map((conversation) => (
                  <li key={conversation.id}>
                    <button
                      type="button"
                      onClick={() => select(conversation)}
                      aria-pressed={selected?.id === conversation.id}
                      className={cn(
                        'flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-row-hover sm:px-5',
                        selected?.id === conversation.id && 'bg-brand-subtle',
                      )}
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-link">
                        {initials(conversation.contactName)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-aux font-semibold text-foreground">{conversation.contactName}</span>
                          {conversation.unreadCount > 0 ? <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-brand-foreground">{conversation.unreadCount > 9 ? '9+' : conversation.unreadCount}</span> : null}
                        </span>
                        <span className="mt-1 block truncate text-label text-muted">{preview(conversation)}</span>
                        <span className="mt-2 flex items-center gap-2">
                          <StatusBadge tone={statusMeta[conversation.status].tone}>{statusMeta[conversation.status].label}</StatusBadge>
                          {conversation.isAiHandled ? <span className="inline-flex items-center gap-1 text-label text-link"><Bot aria-hidden className="size-3.5" />IA</span> : null}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </nav>

            <ConversationDetail
              conversation={selected}
              assignees={assignees}
              canMutate={canMutate}
              busy={pending}
              onChangeStatus={(status) => {
                if (!selected || !canChangeStatus(selected.status, status)) return
                void run(() => onChangeStatus(selected.id, status))
              }}
              onAssign={(assigneeId) => {
                if (!selected) return
                void run(() => onAssign(selected.id, assigneeId))
              }}
            />
          </div>
        )}
      </Card>
    </div>
  )
}

function ConversationDetail({
  conversation,
  assignees,
  canMutate,
  busy,
  onChangeStatus,
  onAssign,
}: {
  conversation: InboxConversationDto | null
  assignees: readonly InboxAssigneeOptionDto[]
  canMutate: boolean
  busy: boolean
  onChangeStatus: (status: ConversationStatus) => void
  onAssign: (assigneeId: string | null) => void
}) {
  if (!conversation) {
    return (
      <div className="hidden min-h-[34rem] items-center justify-center p-8 md:flex">
        <EmptyState icon={MessageCircle} title="Selecione uma conversa" description="O histórico aparecerá aqui." />
      </div>
    )
  }

  const meta = statusMeta[conversation.status]

  return (
    <section aria-label={`Conversa com ${conversation.contactName}`} className="flex min-h-[34rem] min-w-0 flex-col">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border-card px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-link">{initials(conversation.contactName)}</span>
          <div className="min-w-0">
            <h2 className="truncate text-card-title font-semibold text-foreground">{conversation.contactName}</h2>
            <p className="mt-0.5 text-label text-muted">{conversation.contactPhone}</p>
            {conversation.patientId && conversation.patientName ? <Link href={`/pacientes/${conversation.patientId}`} className="mt-1 inline-block text-label font-semibold text-link hover:underline">Abrir ficha de {conversation.patientName}</Link> : null}
          </div>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <div className="flex items-center gap-2 sm:justify-end">
            <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
            {conversation.isAiHandled ? <span className="inline-flex items-center gap-1 text-label text-link"><Bot aria-hidden className="size-3.5" />IA atendendo</span> : null}
          </div>
          {canMutate ? (
            <div className="flex flex-wrap items-end gap-2">
              <SelectField
                label="Status da conversa"
                value={conversation.status}
                disabled={busy}
                onChange={(event) => onChangeStatus(event.target.value as ConversationStatus)}
                options={conversationStatusOptions.map((option) => ({ value: option.value, label: option.label }))}
                className="w-40"
              />
              <SelectField
                label="Responsável"
                value={conversation.assignedTo?.id ?? ''}
                disabled={busy}
                onChange={(event) => onAssign(event.target.value || null)}
                options={[{ value: '', label: 'Sem responsável' }, ...assignees.map((assignee) => ({ value: assignee.id, label: assignee.name }))]}
                className="w-48"
              />
            </div>
          ) : (
            <p className="text-label text-muted">{conversation.assignedTo ? `Responsável: ${conversation.assignedTo.name}` : 'Sem responsável'}</p>
          )}
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto bg-background/50 px-4 py-5 sm:px-6">
        {conversation.messages.length === 0 ? (
          <EmptyState icon={MessageCircle} title="Nenhuma mensagem carregada." description="A conversa existe, mas ainda não há mensagens persistidas para exibir." />
        ) : conversation.messages.map((message) => <MessageBubble key={message.id} message={message} />)}
      </div>

      <footer className="border-t border-border-card px-4 py-4 sm:px-6">
        <div className="flex items-start gap-2.5 rounded-field border border-border-card bg-surface px-3 py-3 text-label text-muted">
          <CheckCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-link" />
          <p>Envio de mensagens e respostas rápidas serão habilitados com o provedor de WhatsApp e o worker de comunicação.</p>
        </div>
      </footer>
    </section>
  )
}

function MessageBubble({ message }: { message: InboxMessageDto }) {
  const outbound = message.direction === 'outbound'

  /*
    NOTA INTERNA — não é fala de ninguém, e por isso não é bolha.

    `internal` entrou no enum para o assistente registrar por que calou
    ("Possível urgência", "Assunto clínico"). Sem este ramo, a nota caía no
    `else` e aparecia à esquerda, no lugar da mensagem do paciente — como se ele
    tivesse escrito "Assunto clínico — apenas a equipe responde".

    Centralizada, discreta e com aviso explícito: quem lê precisa saber, em um
    olhar, que aquilo NÃO foi enviado ao paciente.
  */
  if (message.direction === 'internal') {
    return (
      <div className="flex justify-center">
        <p className="max-w-[min(90%,36rem)] rounded-card border border-dashed border-border-card bg-background px-3.5 py-2 text-center text-label text-muted">
          <span className="font-semibold">Nota interna</span> · não enviada ao
          paciente
          <br />
          {message.body}
        </p>
      </div>
    )
  }

  return (
    <div className={cn('flex', outbound ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[min(90%,36rem)] rounded-card px-4 py-3 text-aux shadow-card', outbound ? 'bg-brand text-brand-foreground' : 'border border-border-card bg-surface text-foreground')}>
        {message.isFromAi ? <p className="mb-1 text-label font-semibold opacity-80">Resposta da IA</p> : null}
        {message.body ? <p className="whitespace-pre-wrap">{message.body}</p> : <p className="italic opacity-70">{message.contentType === 'image' ? 'Imagem' : 'Anexo'}</p>}
        {/*
          Hora da mensagem, no formato do resto do produto.

          `toLocaleString` trazia segundos ("12/08/2026, 14:30:07") dentro de uma
          bolha de conversa — precisão que ninguém usa e que rouba a linha do
          texto que importa.
        */}
        <p className="mt-1 text-right text-[11px] opacity-70">
          {(() => {
            const sentAt = new Date(message.sentAt ?? message.createdAt)
            return `${formatShortDate(sentAt)} · ${formatTime(sentAt)}`
          })()}
        </p>
      </div>
    </div>
  )
}

function preview(conversation: InboxConversationDto): string {
  const last = conversation.messages.at(-1)
  if (!last) return conversation.patientName ?? conversation.contactPhone
  if (last.body) return last.body
  return last.contentType === 'image' ? 'Imagem' : 'Anexo'
}

function initials(name: string): string {
  return name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '?'
}
