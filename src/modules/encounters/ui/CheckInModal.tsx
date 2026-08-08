'use client'

import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { SelectField } from '@/components/ui/select-field'
import { TextField } from '@/components/ui/text-field'

import { checkInAction } from '../actions/checkIn.action'
import {
  DEFAULT_PRIORITY,
  encounterMessages,
  priorityOptions,
} from '../schemas/encounter.schema'

export interface CheckInOption {
  id: string
  name: string
}

export interface CheckInModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  patients: readonly CheckInOption[]
  professionals: readonly CheckInOption[]
  onDone: () => void
}

/**
 * Registro de chegada (E-01).
 *
 * O formulário é curto de propósito: quem opera está com o paciente na frente,
 * em pé no balcão. Paciente e prioridade bastam para entrar na fila; o
 * profissional é opcional porque nem sempre está definido na chegada, e o
 * motivo é opcional porque exigir uma queixa no balcão empurra dado clínico
 * para a recepção.
 */
export function CheckInModal({
  open,
  onOpenChange,
  patients,
  professionals,
  onDone,
}: CheckInModalProps) {
  const [patientId, setPatientId] = useState('')
  const [professionalId, setProfessionalId] = useState('')
  const [priority, setPriority] = useState(String(DEFAULT_PRIORITY))
  const [reason, setReason] = useState('')
  const [isSubmitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setPatientId('')
    setProfessionalId('')
    setPriority(String(DEFAULT_PRIORITY))
    setReason('')
    setError(null)
  }

  async function handleSubmit() {
    if (!patientId) {
      setError(encounterMessages.patientRequired)
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const result = await checkInAction({
        patientId,
        professionalId,
        priority,
        reason,
      })

      if (!result.ok) {
        setError(result.error.message)
        return
      }

      reset()
      onOpenChange(false)
      onDone()
    } catch {
      setError(encounterMessages.unavailable)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
      title="Registrar chegada"
      description="O paciente entra na fila de espera com a hora de agora."
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
            {isSubmitting ? 'Registrando...' : 'Entrar na fila'}
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
          label="Profissional (opcional)"
          value={professionalId}
          onChange={(event) => setProfessionalId(event.target.value)}
          options={[
            { value: '', label: 'Definir depois' },
            ...professionals.map((professional) => ({
              value: professional.id,
              label: professional.name,
            })),
          ]}
        />

        <SelectField
          label="Prioridade"
          value={priority}
          onChange={(event) => setPriority(event.target.value)}
          options={[...priorityOptions]}
        />

        <TextField
          label="Motivo (opcional)"
          placeholder="Retorno, exame, encaixe..."
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
    </Modal>
  )
}
