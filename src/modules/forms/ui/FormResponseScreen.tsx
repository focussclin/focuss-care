'use client'

import { ArrowLeft, CheckCircle2, FileSignature, Info, Paperclip, Send } from 'lucide-react'
import Link from 'next/link'
import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { SelectField } from '@/components/ui/select-field'
import { TextareaField } from '@/components/ui/textarea-field'
import { TextField } from '@/components/ui/text-field'

import type { FormFieldDto } from '../schemas/form.schema'
import { formResponseMessages } from '../schemas/formResponse.schema'
import type { FormResponseScreenProps } from './FormResponseScreen.props'

type Answers = Record<string, string | string[]>

export function FormResponseScreen({
  form,
  patients,
  onSave,
  isLive,
}: FormResponseScreenProps) {
  const [patientId, setPatientId] = useState('')
  const [answers, setAnswers] = useState<Answers>({})
  const [responseId, setResponseId] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [saving, setSaving] = useState<'draft' | 'submitted' | null>(null)

  const unsupportedForSubmit = form.fields.some((field) =>
    ['signature', 'upload'].includes(field.type),
  )

  function setAnswer(fieldId: string, value: string | string[]) {
    setAnswers((current) => ({ ...current, [fieldId]: value }))
  }

  function setCheckbox(fieldId: string, option: string, checked: boolean) {
    const current = answers[fieldId]
    const values = Array.isArray(current) ? [...current] : []
    const next = checked
      ? [...values, option]
      : values.filter((value) => value !== option)
    setAnswer(fieldId, next)
  }

  async function handleSave(status: 'draft' | 'submitted') {
    setError(null)
    setSuccess(null)

    if (!patientId) {
      setError(formResponseMessages.patientRequired)
      return
    }
    if (status === 'submitted' && unsupportedForSubmit) {
      setError(formResponseMessages.unsupportedField)
      return
    }

    setSaving(status)
    try {
      const result = await onSave({
        formId: form.id,
        patientId,
        responseId,
        status,
        answers,
      })
      if (result.error) {
        setError(result.error)
        return
      }
      if (result.response) {
        setResponseId(result.response.id)
        setSubmitted(result.response.status === 'submitted')
        setSuccess(
          status === 'submitted'
            ? 'Resposta enviada e registrada no prontuário administrativo.'
            : 'Rascunho salvo. Você pode continuar preenchendo.',
        )
      }
    } catch {
      setError(formResponseMessages.unavailable)
    } finally {
      setSaving(null)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void handleSave('submitted')
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" asChild>
          <Link href="/formularios">
            <ArrowLeft aria-hidden className="size-4" />
            Voltar para formulários
          </Link>
        </Button>
      </div>

      <header>
        <p className="text-label font-semibold tracking-[0.08em] text-muted uppercase">Coleta digital</p>
        <h1 className="mt-1.5 text-display-sm font-semibold tracking-[-0.01em] text-foreground">{form.name}</h1>
        <p className="mt-1 text-aux text-muted">{form.description || 'Preencha as informações solicitadas pela clínica.'}</p>
      </header>

      <div className="flex items-start gap-2.5 rounded-card border border-status-pending/25 bg-status-pending-surface px-4 py-3 text-aux text-status-pending">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
        <p>
          {isLive
            ? 'Escolha o paciente antes de começar. O rascunho fica vinculado à clínica e pode ser retomado nesta sessão.'
            : 'Modo demonstração: respostas não são gravadas enquanto o banco não estiver conectado.'}
        </p>
      </div>

      {error ? (
        <div role="alert" className="rounded-card border border-status-negative/25 bg-status-negative-surface px-4 py-3 text-aux text-status-negative">
          {error}
        </div>
      ) : null}
      {success ? (
        <div role="status" className="flex items-center gap-2.5 rounded-card border border-status-positive/25 bg-status-positive-surface px-4 py-3 text-aux text-status-positive">
          <CheckCircle2 aria-hidden className="size-4 shrink-0" />
          {success}
        </div>
      ) : null}

      <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
        <Card className="p-5">
          <SelectField
            label="Paciente"
            options={[
              { value: '', label: 'Selecione um paciente' },
              ...patients.map((patient) => ({ value: patient.id, label: patient.name })),
            ]}
            value={patientId}
            onChange={(event) => setPatientId(event.target.value)}
            disabled={submitted || !isLive}
          />
          {patients.length === 0 ? (
            <p className="mt-2 text-label text-muted">Nenhum paciente ativo disponível para vincular a resposta.</p>
          ) : null}
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="flex flex-col gap-5">
            {form.fields.map((field, index) => (
              <ResponseField
                key={field.id}
                field={field}
                index={index}
                value={answers[field.id]}
                disabled={submitted || !isLive}
                onChange={(value) => setAnswer(field.id, value)}
                onCheck={(option, checked) => setCheckbox(field.id, option, checked)}
              />
            ))}
          </div>
        </Card>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void handleSave('draft')}
            isLoading={saving === 'draft'}
            disabled={!isLive || submitted || saving !== null}
          >
            Salvar rascunho
          </Button>
          <Button
            type="submit"
            isLoading={saving === 'submitted'}
            disabled={!isLive || submitted || saving !== null}
          >
            <Send aria-hidden className="size-4" />
            Enviar resposta
          </Button>
        </div>
      </form>
    </div>
  )
}

function ResponseField({
  field,
  index,
  value,
  disabled,
  onChange,
  onCheck,
}: {
  field: FormFieldDto
  index: number
  value: string | readonly string[] | undefined
  disabled: boolean
  onChange: (value: string) => void
  onCheck: (option: string, checked: boolean) => void
}) {
  const current = Array.isArray(value) ? value : []
  const label = `${index + 1}. ${field.label}${field.required ? ' *' : ''}`
  const hint = field.helpText ?? undefined

  if (field.type === 'textarea') {
    return (
      <TextareaField
        label={label}
        hint={hint}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
    )
  }

  if (field.type === 'select') {
    return (
      <SelectField
        label={label}
        options={[{ value: '', label: 'Selecione uma opção' }, ...field.options.map((option) => ({ value: option, label: option }))]}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
    )
  }

  if (field.type === 'radio') {
    return (
      <ChoiceGroup label={label} hint={hint} options={field.options} selected={typeof value === 'string' ? value : ''} disabled={disabled} onSelect={onChange} />
    )
  }

  if (field.type === 'checkbox') {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-label font-semibold text-foreground">{label}</p>
        {hint ? <p className="text-label text-muted">{hint}</p> : null}
        {field.options.map((option) => (
          <label key={option} className="flex min-h-11 items-center gap-2 text-aux text-foreground">
            <input
              type="checkbox"
              checked={current.includes(option)}
              onChange={(event) => onCheck(option, event.target.checked)}
              disabled={disabled}
              className="size-4 accent-brand"
            />
            {option}
          </label>
        ))}
      </div>
    )
  }

  if (field.type === 'scale') {
    return (
      <SelectField
        label={label}
        options={[{ value: '', label: 'Selecione uma nota' }, ...Array.from({ length: 11 }, (_, number) => ({ value: String(number), label: String(number) }))]}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
    )
  }

  if (field.type === 'signature' || field.type === 'upload') {
    return (
      <div className="flex items-start gap-3 rounded-field border border-dashed border-border-default bg-background/60 px-4 py-4 text-aux text-muted">
        {field.type === 'signature' ? <FileSignature aria-hidden className="mt-0.5 size-5 shrink-0 text-link" /> : <Paperclip aria-hidden className="mt-0.5 size-5 shrink-0 text-link" />}
        <div>
          <p className="font-semibold text-foreground">{label}</p>
          <p className="mt-1 text-label">Este tipo será habilitado com a integração correspondente. Rascunhos podem ser salvos, mas o envio fica bloqueado.</p>
        </div>
      </div>
    )
  }

  return (
    <TextField
      label={label}
      hint={hint}
      type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
      value={typeof value === 'string' ? value : ''}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
    />
  )
}

function ChoiceGroup({
  label,
  hint,
  options,
  selected,
  disabled,
  onSelect,
}: {
  label: string
  hint?: string
  options: readonly string[]
  selected: string
  disabled: boolean
  onSelect: (value: string) => void
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-label font-semibold text-foreground">{label}</legend>
      {hint ? <p className="text-label text-muted">{hint}</p> : null}
      {options.map((option) => (
        <label key={option} className="flex min-h-11 items-center gap-2 text-aux text-foreground">
          <input
            type="radio"
            name={label}
            value={option}
            checked={selected === option}
            onChange={() => onSelect(option)}
            disabled={disabled}
            className="size-4 accent-brand"
          />
          {option}
        </label>
      ))}
    </fieldset>
  )
}
