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
import { useMemo, useState } from 'react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { SelectField } from '@/components/ui/select-field'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { TextField } from '@/components/ui/text-field'
import { cn } from '@/lib/utils/cn'

import { conversationStatusOptions, type InboxConversationDto, type InboxMessageDto } from '../schemas/inbox.schema'
import type { InboxScreenProps } from './InboxScreen.props'

type StatusFilter = 'all' | InboxConversationDto['status']

const statusMeta: Record<InboxConversationDto['status'], { label: string; tone: StatusTone }> = {
  open: { label: 'Aberta', tone: 'positive' },
  pending: { label: 'Aguardando', tone: 'pending' },
  resolved: { label: 'Resolvida', tone: 'neutral' },
  archived: { label: 'Arquivada', tone: 'neutral' },
}

export function InboxScreen({ conversations, isLive }: InboxScreenProps) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(conversations[0]?.id ?? null)

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('pt-BR')
    return conversations.filter((conversation) => {
      const matchesQuery =
        !normalized ||
        conversation.contactName.toLocaleLowerCase('pt-BR').includes(normalized) ||
        conversation.contactPhone.includes(normalized) ||
        conversation.patientName?.toLocaleLowerCase('pt-BR').includes(normalized)
      return matchesQuery && (statusFilter === 'all' || conversation.status === statusFilter)
    })
  }, [conversations, query, statusFilter])

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
            ? 'A leitura está conectada ao banco. Recebimento e envio de mensagens dependem do provedor de WhatsApp e da ingestão de eventos.'
            : 'Modo demonstração: nenhuma conversa fictícia é exibida. Conecte o Supabase e o provedor para alimentar a Inbox.'}
        </p>
      </div>

      <Card className="overflow-hidden">
        <div className="grid gap-4 border-b border-border-card px-4 py-4 sm:grid-cols-[minmax(0,1fr)_220px] sm:px-5">
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
                      onClick={() => setSelectedId(conversation.id)}
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

            <ConversationDetail conversation={selected} />
          </div>
        )}
      </Card>
    </div>
  )
}

function ConversationDetail({ conversation }: { conversation: InboxConversationDto | null }) {
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
        <div className="flex items-center gap-2">
          <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
          {conversation.isAiHandled ? <span className="inline-flex items-center gap-1 text-label text-link"><Bot aria-hidden className="size-3.5" />IA atendendo</span> : null}
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
  return (
    <div className={cn('flex', outbound ? 'justify-end' : 'justify-start')}>
      <div className={cn('max-w-[min(90%,36rem)] rounded-card px-4 py-3 text-aux shadow-card', outbound ? 'bg-brand text-brand-foreground' : 'border border-border-card bg-surface text-foreground')}>
        {message.isFromAi ? <p className="mb-1 text-label font-semibold opacity-80">Resposta da IA</p> : null}
        {message.body ? <p className="whitespace-pre-wrap">{message.body}</p> : <p className="italic opacity-70">{message.contentType === 'image' ? 'Imagem' : 'Anexo'}</p>}
        <p className="mt-1 text-right text-[11px] opacity-70">{new Date(message.sentAt ?? message.createdAt).toLocaleString('pt-BR')}</p>
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
