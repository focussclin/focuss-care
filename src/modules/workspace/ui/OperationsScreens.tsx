'use client'

import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowRight,
  Bot,
  Clock3,
  Info,
  LockKeyhole,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  UserRound,
  Workflow,
} from 'lucide-react'
import { useState, type FormEvent } from 'react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { SearchField } from '@/components/ui/search-field'
import { StatCard } from '@/components/ui/stat-card'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { cn } from '@/lib/utils/cn'


function Notice({ children, tone = 'info' }: { children: string; tone?: 'info' | 'success' | 'warning' }) {
  const classes = {
    info: 'border-brand/15 bg-brand-subtle text-link',
    success: 'border-status-positive/15 bg-status-positive-surface text-status-positive',
    warning: 'border-attention/20 bg-attention-surface text-attention',
  }

  return (
    <div className={cn('flex items-start gap-2.5 rounded-xl border px-4 py-3 text-aux', classes[tone])}>
      <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </div>
  )
}



const conversations = [
  { id: 'conv-1', name: 'Marina Costa', preview: 'Confirmado para hoje às 09:00', time: '09:12', unread: 2, patientId: 'pat-1' },
  { id: 'conv-2', name: 'João Almeida', preview: 'Posso remarcar meu retorno?', time: 'Ontem', unread: 0, patientId: 'pat-2' },
  { id: 'conv-3', name: 'Beatriz Nogueira', preview: 'Obrigada pelo atendimento!', time: 'Ter', unread: 0, patientId: 'pat-3' },
]

export function WhatsappScreen() {
  const [selectedId, setSelectedId] = useState('conv-1')
  const [query, setQuery] = useState('')
  const selected = conversations.find((item) => item.id === selectedId) ?? conversations[0]
  const visible = conversations.filter((item) => item.name.toLowerCase().includes(query.trim().toLowerCase()))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Relacionamento" title="WhatsApp" description="Organize as conversas da clínica em um só lugar." actions={<Button disabled title="Conecte uma conta do WhatsApp Business para habilitar o canal"><MessageCircle aria-hidden className="size-4" /> Conectar WhatsApp</Button>} />
      <Notice tone="warning">O WhatsApp ainda não está conectado. A caixa de entrada abaixo é uma prévia visual e não envia mensagens.</Notice>
      <Card className="overflow-hidden"><div className="grid min-h-[540px] lg:grid-cols-[260px_minmax(0,1fr)_250px]">
        <aside className="border-b border-border-card lg:border-r lg:border-b-0"><div className="border-b border-border-card p-4"><SearchField label="Buscar conversa" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar conversa" /></div><div className="flex gap-1 overflow-x-auto border-b border-border-card p-3 lg:block lg:space-y-1 lg:border-0"><button type="button" className="shrink-0 rounded-lg bg-brand-subtle px-3 py-2 text-left text-label font-semibold text-link">Todas <span className="ml-1 text-muted">3</span></button><button type="button" disabled title="Filtro em breve" className="shrink-0 rounded-lg px-3 py-2 text-left text-label text-muted opacity-70">Não lidas</button><button type="button" disabled title="Filtro em breve" className="shrink-0 rounded-lg px-3 py-2 text-left text-label text-muted opacity-70">Agendamentos</button></div><div className="hidden lg:block">{visible.map((conversation) => <button key={conversation.id} type="button" onClick={() => setSelectedId(conversation.id)} className={cn('flex w-full items-start gap-3 border-t border-border-card px-4 py-3 text-left transition-colors hover:bg-row-hover', selected.id === conversation.id && 'bg-brand-subtle/60')}><span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-label font-semibold text-link">{conversation.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</span><span className="min-w-0 flex-1"><span className="flex items-center justify-between gap-2"><span className="truncate text-aux font-semibold text-foreground">{conversation.name}</span><span className="text-[11px] text-muted">{conversation.time}</span></span><span className="mt-1 block truncate text-label text-muted">{conversation.preview}</span></span>{conversation.unread ? <span className="flex size-5 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">{conversation.unread}</span> : null}</button>)}</div></aside>
        <section className="flex min-w-0 flex-col border-b border-border-card lg:border-r lg:border-b-0"><div className="flex items-center justify-between border-b border-border-card p-4"><div className="flex items-center gap-3"><span className="flex size-9 items-center justify-center rounded-full bg-brand-subtle text-label font-semibold text-link">MC</span><div><p className="text-aux font-semibold text-foreground">{selected.name}</p><p className="text-label text-muted">WhatsApp · prévia</p></div></div><button type="button" disabled title="Mais ações em breve" className="inline-flex size-9 items-center justify-center rounded-lg text-muted opacity-50"><MoreHorizontal aria-hidden className="size-4" /></button></div><div className="flex flex-1 flex-col justify-end gap-3 bg-background p-4"><div className="max-w-[80%] self-start rounded-2xl rounded-bl-md border border-border-card bg-surface px-4 py-3 text-aux text-foreground shadow-card">Olá! Gostaria de confirmar meu atendimento de hoje.</div><span className="self-start text-label text-muted">09:08</span><div className="max-w-[80%] self-end rounded-2xl rounded-br-md bg-brand px-4 py-3 text-aux text-white">Olá, Marina! Seu atendimento com a Dra. Ana está confirmado para as 09:00.</div><span className="self-end text-label text-muted">09:12 · visualizado</span></div><div className="border-t border-border-card p-4"><div className="flex items-center gap-2 rounded-xl border border-border-card bg-background p-1.5"><button type="button" disabled title="Anexos em breve" className="inline-flex size-9 items-center justify-center rounded-lg text-muted opacity-50"><Paperclip aria-hidden className="size-4" /></button><input disabled aria-label="Mensagem" placeholder="Conecte o WhatsApp para responder" className="min-w-0 flex-1 bg-transparent px-2 text-aux text-foreground outline-none placeholder:text-muted" /><button type="button" disabled title="Conecte o WhatsApp para enviar" className="inline-flex size-9 items-center justify-center rounded-lg bg-brand text-white opacity-50"><Send aria-hidden className="size-4" /></button></div></div></section>
        <aside className="hidden p-5 lg:block"><div className="flex items-center gap-2 text-label font-semibold text-muted"><UserRound aria-hidden className="size-4" /> Contexto do paciente</div><div className="mt-5 flex size-14 items-center justify-center rounded-2xl bg-brand-subtle text-xl font-semibold text-link">MC</div><h2 className="mt-3 text-control font-semibold text-foreground">{selected.name}</h2><p className="mt-1 text-label text-muted">Paciente ativo</p><div className="mt-6 space-y-4 border-t border-border-card pt-5"><div><p className="text-label text-muted">Próximo atendimento</p><p className="mt-1 text-aux font-semibold text-foreground">Hoje · 09:00</p></div><div><p className="text-label text-muted">Preferência</p><p className="mt-1 text-aux font-semibold text-foreground">WhatsApp</p></div></div><Button variant="secondary" fullWidth className="mt-6" asChild><Link href={`/pacientes/${selected.patientId}`}>Ver perfil</Link></Button></aside>
      </div></Card>
    </div>
  )
}

type ChatMessage = { id: number; role: 'assistant' | 'user'; text: string }
const aiAnswers: Record<string, string> = {
  'Quais são os atendimentos de hoje?': 'Hoje a clínica tem 24 atendimentos previstos. Há 3 pessoas aguardando e o próximo horário é às 11:00 com a Dra. Helena Souza.',
  'Mostre pacientes sem retorno': 'Encontrei 8 pacientes sem novo atendimento nos últimos 90 dias. Posso ajudar a organizar uma lista para revisão da equipe.',
  'Resuma a agenda da semana': 'A agenda concentra 54 atendimentos nesta semana, com maior movimento na quarta-feira. A taxa média de comparecimento está em 92%.',
}

export function ChatIaScreen() {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([{ id: 1, role: 'assistant', text: 'Olá! Sou o Assistente Focuss. Posso ajudar a encontrar informações da clínica e organizar o próximo passo.' }])

  function sendMessage(event?: FormEvent) {
    event?.preventDefault()
    const value = input.trim()
    if (!value) return
    const answer = aiAnswers[value] ?? 'Esta é uma prévia visual do Assistente Focuss. Quando a integração estiver conectada, vou consultar os dados autorizados da sua clínica para responder com contexto.'
    setMessages((current) => [...current, { id: Date.now(), role: 'user', text: value }, { id: Date.now() + 1, role: 'assistant', text: answer }])
    setInput('')
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Inteligência aplicada" title="Assistente Focuss" description="Use seus dados para encontrar informações e organizar tarefas." />
      <Notice>A IA sugere. Você revisa e confirma. Nenhuma ação é executada automaticamente.</Notice>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]"><Card className="flex min-h-[620px] flex-col overflow-hidden"><div className="flex items-center gap-3 border-b border-border-card p-5"><span className="flex size-10 items-center justify-center rounded-xl bg-brand text-white"><Bot aria-hidden className="size-5" /></span><div><p className="text-control font-semibold text-foreground">Conversa com sua clínica</p><p className="text-label text-muted">Prévia local · sem conexão com dados reais</p></div><span className="ml-auto flex items-center gap-1.5 text-label text-muted"><span className="size-2 rounded-full bg-attention" />Prévia</span></div><div className="flex flex-1 flex-col gap-4 overflow-y-auto bg-background p-5">{messages.map((message) => <div key={message.id} className={cn('max-w-[86%] rounded-2xl px-4 py-3 text-aux leading-6', message.role === 'assistant' ? 'self-start border border-border-card bg-surface text-foreground shadow-card' : 'self-end bg-brand text-white')}>{message.text}</div>)}</div><div className="border-t border-border-card p-4"><div className="mb-3 flex flex-wrap gap-2">{Object.keys(aiAnswers).map((prompt) => <button key={prompt} type="button" onClick={() => setInput(prompt)} className="rounded-full border border-border-card bg-surface px-3 py-2 text-label text-muted transition-colors hover:border-brand/40 hover:text-link">{prompt}</button>)}</div><form onSubmit={sendMessage} className="flex items-center gap-2 rounded-xl border border-border-default bg-surface p-1.5 focus-within:border-focus focus-within:shadow-focus"><input value={input} onChange={(event) => setInput(event.target.value)} aria-label="Pergunte algo sobre sua clínica" placeholder="Pergunte algo sobre sua clínica..." className="min-w-0 flex-1 bg-transparent px-3 text-aux text-foreground outline-none placeholder:text-muted" /><Button type="submit" className="size-10 shrink-0 p-0" aria-label="Enviar pergunta"><Send aria-hidden className="size-4" /></Button></form></div></Card><div className="space-y-6"><div className="relative aspect-[4/3] overflow-hidden rounded-card"><Image src="/images/login-clinic.png" alt="Profissional de saúde organizando informações da clínica" fill sizes="(max-width: 1280px) 100vw, 320px" className="object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-brand/90 via-brand/20 to-transparent" /><div className="absolute right-4 bottom-4 left-4 text-white"><Sparkles aria-hidden className="mb-2 size-5" /><p className="text-control font-semibold">Mais clareza para decisões melhores.</p><p className="mt-1 text-label text-white/75">Insights com contexto, sempre sob sua revisão.</p></div></div><Card className="p-5"><div className="flex items-start gap-3"><span className="flex size-9 items-center justify-center rounded-xl bg-brand-subtle text-link"><LockKeyhole aria-hidden className="size-4" /></span><div><p className="text-aux font-semibold text-foreground">Privacidade em primeiro lugar</p><p className="mt-1 text-label leading-5 text-muted">O acesso deve respeitar as permissões da equipe e fica registrado.</p></div></div></Card></div></div>
    </div>
  )
}

const automationSeed = [
  { id: 'auto-1', name: 'Lembrete 24h antes', trigger: 'Atendimento confirmado', lastRun: 'Hoje, 08:40', enabled: true, tone: 'positive' as StatusTone, status: 'Ativa' },
  { id: 'auto-2', name: 'Retorno após consulta', trigger: 'Atendimento concluído', lastRun: 'Ontem, 17:20', enabled: true, tone: 'positive' as StatusTone, status: 'Ativa' },
  { id: 'auto-3', name: 'Aniversários do mês', trigger: 'Primeiro dia do mês', lastRun: '01 ago, 09:00', enabled: false, tone: 'neutral' as StatusTone, status: 'Pausada' },
]

export function AutomacoesScreen() {
  const [items, setItems] = useState(automationSeed)
  const [notice, setNotice] = useState('')

  function toggle(id: string) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, enabled: !item.enabled, status: item.enabled ? 'Pausada' : 'Ativa', tone: item.enabled ? 'neutral' : 'positive' } : item))
    setNotice('O estado foi alterado apenas nesta prévia local. A automação real será conectada ao módulo de regras.')
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow="Produtividade" title="Automações" description="Crie lembretes e ações para sua equipe trabalhar com mais tranquilidade." actions={<Button disabled title="O construtor de automações será habilitado na próxima etapa"><Plus aria-hidden className="size-4" /> Nova automação</Button>} />
      {notice ? <Notice tone="success">{notice}</Notice> : null}
      <div className="grid gap-3 sm:grid-cols-3"><StatCard label="Automações ativas" value="02" icon={Workflow} /><StatCard label="Execuções este mês" value="184" icon={RefreshCw} trend="+16%" /><StatCard label="Horas economizadas" value="12h" icon={Clock3} /></div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]"><Card className="overflow-hidden"><CardHeader title="Regras da clínica" description="Acompanhe o que está automatizado e sob controle." /><div className="divide-y divide-border-card">{items.map((item) => <div key={item.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-start gap-3"><span className={cn('mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl', item.enabled ? 'bg-brand-subtle text-link' : 'bg-background text-muted')}><Workflow aria-hidden className="size-4" /></span><div className="min-w-0"><p className="truncate text-aux font-semibold text-foreground">{item.name}</p><p className="mt-1 text-label text-muted">Quando: {item.trigger} · Última execução: {item.lastRun}</p></div></div><div className="flex items-center justify-between gap-3 sm:justify-end"><StatusBadge tone={item.tone}>{item.status}</StatusBadge><button type="button" aria-pressed={item.enabled} onClick={() => toggle(item.id)} className={cn('relative h-7 w-12 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-focus focus:ring-offset-2', item.enabled ? 'bg-brand' : 'bg-border-default')}><span className={cn('absolute top-1 size-5 rounded-full bg-white shadow-sm transition-transform', item.enabled ? 'left-6' : 'left-1')} /><span className="sr-only">{item.enabled ? 'Pausar' : 'Ativar'} {item.name}</span></button><button type="button" disabled title="Mais ações em breve" className="inline-flex size-9 items-center justify-center rounded-lg text-muted opacity-50"><MoreHorizontal aria-hidden className="size-4" /></button></div></div>)}</div></Card><Card className="p-5"><div className="flex items-center gap-2 text-label font-semibold uppercase tracking-[0.08em] text-muted"><Sparkles aria-hidden className="size-4 text-link" /> Exemplo de fluxo</div><h2 className="mt-3 text-control font-semibold text-foreground">Lembrete de atendimento</h2><p className="mt-1 text-aux leading-6 text-muted">Uma prévia de como uma regra pode ser configurada.</p><div className="mt-5 space-y-2"><div className="rounded-xl border border-border-card bg-background p-3"><p className="text-label font-semibold text-muted">QUANDO ISSO ACONTECER</p><p className="mt-1 text-aux font-semibold text-foreground">Atendimento confirmado</p></div><ArrowRight aria-hidden className="mx-auto size-4 rotate-90 text-muted" /><div className="rounded-xl border border-border-card bg-background p-3"><p className="text-label font-semibold text-muted">FAÇA ISTO</p><p className="mt-1 text-aux font-semibold text-foreground">Enviar lembrete 24h antes</p></div></div><Notice tone="info">Toda regra exige revisão antes de ser ativada.</Notice></Card></div>
    </div>
  )
}
