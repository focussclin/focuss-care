'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { SelectField } from '@/components/ui/select-field'
import { TextareaField } from '@/components/ui/textarea-field'

import { amendRecordAction } from '../actions/amendRecord.action'
import { createRecordAction } from '../actions/createRecord.action'
import {
  recordMessages,
  recordTypeOptions,
  type MedicalRecordDto,
} from '../schemas/record.schema'
import type { RecordPatientOption } from './ProntuariosScreen'

export interface RecordEditorModalProps {
  mode: 'create' | 'amend'
  open: boolean
  onOpenChange: (open: boolean) => void
  patients: readonly RecordPatientOption[]
  /** Registro sendo corrigido. Obrigatório no modo `amend`. */
  record?: MedicalRecordDto | null
  onDone: () => void
}

/**
 * Editor de registro do prontuário (R-01).
 *
 * O mesmo componente serve para criar e para corrigir, mas **a correção parte
 * do texto atual**, não de um campo vazio. Corrigir uma evolução quase nunca é
 * reescrevê-la do zero: é ajustar uma frase. Começar em branco convidaria a
 * perder o que já estava certo.
 *
 * No modo `amend`, paciente e tipo não são editáveis — eles são herdados da
 * versão anterior pelo servidor. Mudar o paciente de um registro existente não
 * é correção, é outro registro.
 */
export function RecordEditorModal({
  mode,
  open,
  onOpenChange,
  patients,
  record = null,
  onDone,
}: RecordEditorModalProps) {
  const [patientId, setPatientId] = useState('')
  const [recordType, setRecordType] = useState<string>('evolution')
  const [content, setContent] = useState('')
  const [isSubmitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Ajuste durante o render: quando o modal abre para corrigir OUTRO registro,
  // o texto precisa acompanhar. Sem efeito e sem remontar o campo.
  const [syncedId, setSyncedId] = useState<string | null>(null)
  const currentId = record?.id ?? null

  if (mode === 'amend' && currentId !== syncedId) {
    setSyncedId(currentId)
    setContent(record?.content ?? '')
    setError(null)
  }

  function reset() {
    setPatientId('')
    setRecordType('evolution')
    setContent('')
    setError(null)
    setSyncedId(null)
  }

  async function handleSubmit() {
    if (mode === 'create' && !patientId) {
      setError(recordMessages.patientRequired)
      return
    }

    if (content.trim().length === 0) {
      setError(recordMessages.contentRequired)
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const result =
        mode === 'create'
          ? await createRecordAction({ patientId, recordType, content })
          : await amendRecordAction({ recordId: record?.id, content })

      if (!result.ok) {
        setError(result.error.message)
        return
      }

      reset()
      onOpenChange(false)
      onDone()
    } catch {
      setError(recordMessages.unavailable)
    } finally {
      setSubmitting(false)
    }
  }

  const isAmend = mode === 'amend'

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
      title={isAmend ? 'Corrigir registro' : 'Nova evolução'}
      description={
        isAmend
          ? 'A versão anterior continua registrada e legível. Esta correção entra como uma versão nova.'
          : 'O registro é assinado por você e não pode ser apagado depois.'
      }
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} isLoading={isSubmitting}>
            {isSubmitting ? 'Salvando...' : 'Salvar registro'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? (
          <p
            role="alert"
            className="rounded-field border border-danger/30 bg-danger-surface px-3.5 py-2.5 text-aux text-danger"
          >
            {error}
          </p>
        ) : null}

        {isAmend ? (
          <p className="rounded-field border border-border-card bg-background px-3.5 py-2.5 text-label text-muted">
            Corrigindo a versão {record?.version ?? 1}. O texto anterior
            permanece no histórico.
          </p>
        ) : (
          <>
            <SelectField
              label="Paciente"
              value={patientId}
              onChange={(event) => setPatientId(event.target.value)}
              options={[
                { value: '', label: 'Selecione o paciente' },
                ...patients.map((patient) => ({
                  value: patient.id,
                  label: patient.name,
                })),
              ]}
            />

            <SelectField
              label="Tipo de registro"
              value={recordType}
              onChange={(event) => setRecordType(event.target.value)}
              options={[...recordTypeOptions]}
            />
          </>
        )}

        <TextareaField
          label="Registro"
          rows={10}
          placeholder="Descreva a evolução, a conduta e as orientações."
          value={content}
          onChange={(event) => setContent(event.target.value)}
        />
      </div>
    </Modal>
  )
}
