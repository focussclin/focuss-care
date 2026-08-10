'use client'

import { Copy, Info, MessageSquareText, Pencil, Plus, Undo2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { SelectField } from '@/components/ui/select-field'
import { StatusBadge } from '@/components/ui/status-badge'
import { TextareaField } from '@/components/ui/textarea-field'
import { TextField } from '@/components/ui/text-field'

import { extractVariables, sortTemplates } from '../domain/MessageTemplate'
import {
  messageTemplateMessages,
  type MessageTemplateDto,
  type MessageTemplateFormValues,
} from '../schemas/messageTemplate.schema'
import type { MessageTemplatesPanelProps } from './MessageTemplatesPanel.props'

const emptyForm: MessageTemplateFormValues = { name: '', category: '', body: '' }

/**
 * Biblioteca de modelos de mensagem.
 *
 * # Nada aqui envia
 *
 * Não há provedor, não há fila, e não existe botão de enviar em lugar nenhum
 * desta tela. O que a biblioteca resolve hoje é concreto e menor: o texto padrão
 * que vive num bloco de notas da recepção passa a viver na clínica, igual para
 * todo mundo, com as variáveis conferidas.
 *
 * # "Aprovado" é do provedor, e a tela não deixa marcar
 *
 * `is_approved` é preenchido por quem aprova modelo de mensagem — a Meta, no
 * caso do WhatsApp Business. Um interruptor aqui afirmaria uma aprovação que
 * ninguém deu, e o erro só apareceria no primeiro envio recusado. O selo mostra
 * o estado e é somente leitura.
 */
export function MessageTemplatesPanel({
  templates,
  onSubmit,
  onSetActive,
  canManage,
  isLive,
  loadError = null,
}: MessageTemplatesPanelProps) {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<MessageTemplateDto | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [category, setCategory] = useState('all')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const editable = canManage && isLive && !loadError

  const categories = useMemo(() => {
    const found = new Set<string>()
    for (const template of templates) {
      if (template.category) found.add(template.category)
    }
    return [...found].sort((left, right) => left.localeCompare(right, 'pt-BR'))
  }, [templates])

  const visible = useMemo(
    () =>
      sortTemplates(
        templates.filter(
          (template) => category === 'all' || template.category === category,
        ),
      ),
    [category, templates],
  )

  /*
   * As variáveis do formulário saem do CORPO, ao vivo.
   *
   * Não há campo para digitá-las: uma lista escrita à mão divergiria do texto no
   * primeiro ajuste, e a tela mostraria variáveis que a mensagem não usa.
   */
  const previewVariables = extractVariables(form.body)

  function openCreate() {
    setEditing(null)
    setForm(emptyForm)
    setError(null)
    setModalOpen(true)
  }

  function openEdit(template: MessageTemplateDto) {
    setEditing(template)
    setForm({
      name: template.name,
      category: template.category ?? '',
      body: template.body,
    })
    setError(null)
    setModalOpen(true)
  }

  function close(force = false) {
    if (saving && !force) return
    setModalOpen(false)
    setEditing(null)
    setForm(emptyForm)
    setError(null)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (form.name.trim().length < 2) {
      setError(messageTemplateMessages.nameRequired)
      return
    }
    if (form.body.trim().length < 3) {
      setError(messageTemplateMessages.bodyRequired)
      return
    }

    setSaving(true)
    try {
      const failure = await onSubmit(form, editing?.id ?? null)
      if (failure) {
        setError(failure)
        return
      }
      close(true)
      router.refresh()
    } catch {
      setError(messageTemplateMessages.unavailable)
    } finally {
      setSaving(false)
    }
  }

  async function toggle(template: MessageTemplateDto) {
    setBusyId(template.id)
    setError(null)
    try {
      const failure = await onSetActive(template.id, !template.isActive)
      if (failure) setError(failure)
      else router.refresh()
    } catch {
      setError(messageTemplateMessages.unavailable)
    } finally {
      setBusyId(null)
    }
  }

  async function copy(template: MessageTemplateDto) {
    /*
     * Copiar é o que esta biblioteca entrega hoje, e o aviso confirma que o
     * texto foi para a área de transferência — e não que foi enviado.
     */
    setNotice(null)
    try {
      await navigator.clipboard.writeText(template.body)
      setNotice(`Texto de "${template.name}" copiado para a área de transferência.`)
    } catch {
      setNotice('Não foi possível copiar. Selecione o texto e copie manualmente.')
    }
  }

  return (
    <Card>
      <CardHeader
        title="Modelos de mensagem"
        description={
          isLive
            ? 'Texto padrão da clínica, com variáveis conferidas.'
            : 'Modo demonstração: nenhum modelo fictício é exibido.'
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            {categories.length > 0 ? (
              <SelectField
                label="Categoria"
                hideLabel
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                options={[
                  { value: 'all', label: 'Todas as categorias' },
                  ...categories.map((item) => ({ value: item, label: item })),
                ]}
                className="w-48"
              />
            ) : null}
            <Button onClick={openCreate} disabled={!editable}>
              <Plus aria-hidden className="size-4" />
              Novo modelo
            </Button>
          </div>
        }
        className="border-b border-border-card"
      />

      <div className="flex items-start gap-2.5 border-b border-border-card bg-status-pending-surface px-5 py-3 text-label text-status-pending">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        <p>{messageTemplateMessages.nothingIsSent}</p>
      </div>

      {loadError ? (
        <div
          role="alert"
          className="m-4 rounded-card border border-status-negative/25 bg-status-negative-surface px-4 py-3 text-aux text-status-negative"
        >
          {loadError}
        </div>
      ) : null}

      {error && !modalOpen ? (
        <div
          role="alert"
          className="m-4 rounded-card border border-status-negative/25 bg-status-negative-surface px-4 py-3 text-aux text-status-negative"
        >
          {error}
        </div>
      ) : null}

      {notice ? (
        <div
          role="status"
          className="m-4 rounded-card border border-status-positive/25 bg-status-positive-surface px-4 py-3 text-aux text-status-positive"
        >
          {notice}
        </div>
      ) : null}

      {visible.length === 0 && !loadError ? (
        <div className="flex items-start gap-2.5 px-5 py-5 text-aux text-muted">
          <MessageSquareText aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p>
            {templates.length === 0
              ? 'Nenhum modelo cadastrado. Comece pelo texto que a recepção mais repete.'
              : 'Nenhum modelo nesta categoria.'}
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border-card">
          {visible.map((template) => (
            <li key={template.id} className="flex flex-wrap items-start gap-3 px-5 py-3.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-aux font-semibold text-foreground">
                    {template.name}
                  </p>
                  {template.isActive ? null : (
                    <StatusBadge tone="neutral">Desativado</StatusBadge>
                  )}
                  {/*
                    Somente leitura: quem aprova é o provedor. Um interruptor
                    aqui afirmaria aprovação que ninguém deu.
                  */}
                  <StatusBadge tone={template.isApproved ? 'positive' : 'pending'}>
                    {template.isApproved
                      ? 'Aprovado pelo provedor'
                      : 'Sem aprovação de provedor'}
                  </StatusBadge>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-label text-muted">
                  {template.body}
                </p>
                {template.variables.length > 0 ? (
                  <p className="mt-1 text-label text-link">
                    Variáveis: {template.variables.map((name) => `{{${name}}}`).join(', ')}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" onClick={() => void copy(template)}>
                  <Copy aria-hidden className="size-4" />
                  Copiar texto
                </Button>
                {editable ? (
                  <>
                    <Button
                      variant="ghost"
                      onClick={() => openEdit(template)}
                      disabled={busyId === template.id}
                    >
                      <Pencil aria-hidden className="size-4" />
                      Editar
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => void toggle(template)}
                      disabled={busyId === template.id}
                    >
                      <Undo2 aria-hidden className="size-4" />
                      {template.isActive ? 'Desativar' : 'Reativar'}
                    </Button>
                  </>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={modalOpen}
        onOpenChange={(open) => (open ? setModalOpen(true) : close())}
        title={editing ? 'Editar modelo' : 'Novo modelo'}
        description="O texto fica guardado para a equipe copiar. Nada é enviado por aqui."
        footer={
          <>
            <Button variant="secondary" onClick={() => close()} disabled={saving}>
              Cancelar
            </Button>
            <Button type="submit" form="template-form" isLoading={saving}>
              Salvar modelo
            </Button>
          </>
        }
      >
        <form id="template-form" className="flex flex-col gap-4" onSubmit={submit} noValidate>
          {error ? (
            <div
              role="alert"
              className="rounded-field border border-status-negative/25 bg-status-negative-surface px-3 py-2 text-label text-status-negative"
            >
              {error}
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Nome do modelo"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Ex.: Confirmação de consulta"
              required
            />
            <TextField
              label="Categoria (opcional)"
              value={form.category}
              onChange={(event) =>
                setForm((current) => ({ ...current, category: event.target.value }))
              }
            />
          </div>

          <TextareaField
            label="Texto"
            value={form.body}
            onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
            placeholder="Olá {{nome_do_paciente}}, sua consulta está confirmada para {{data}}."
            hint="Use {{nome_da_variavel}} — só letras, números e sublinhado."
          />

          <p className="text-label text-muted">
            {previewVariables.length > 0
              ? `Variáveis detectadas: ${previewVariables.map((name) => `{{${name}}}`).join(', ')}`
              : 'Nenhuma variável no texto. O modelo será enviado exatamente como está escrito.'}
          </p>
        </form>
      </Modal>
    </Card>
  )
}
