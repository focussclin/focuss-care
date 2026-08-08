'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useId, useState } from 'react'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { SelectField } from '@/components/ui/select-field'
import { TextField } from '@/components/ui/text-field'
import type { Appointment, Patient, Professional } from '@/modules/_shared/domain/types'

import {
  appointmentMessages,
  appointmentStatusOptions,
  durationOptions,
  newAppointmentSchema,
  type NewAppointmentInput,
} from '../schemas/appointment.schema'

export interface NewAppointmentModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  patients: readonly Patient[]
  professionals: readonly Professional[]
  /** Base para detectar conflito de horario antes de salvar. */
  existingAppointments: readonly Appointment[]
  defaultDate: string
  defaultTime?: string
  /**
   * Envio.
   *
   * Devolve `null` em caso de sucesso, ou a falha para o formulário exibir.
   * O modal **só fecha depois que o servidor confirma** — fechar antes daria
   * "agendado" para algo que pode ter sido recusado.
   */
  onSubmit: (values: NewAppointmentInput) => Promise<AppointmentSubmitFailure | null>
}

export interface AppointmentSubmitFailure {
  /** Mensagem global, exibida no topo do formulário. */
  message: string
  /** Erro por campo, quando o servidor sabe qual recusou. */
  fieldErrors?: Partial<Record<keyof NewAppointmentInput, string>>
}

/** Sobreposicao real de intervalos para o mesmo profissional. */
function findConflict(
  values: NewAppointmentInput,
  appointments: readonly Appointment[],
): Appointment | undefined {
  const [year, month, day] = values.date.split('-').map(Number)
  const [hours, minutes] = values.time.split(':').map(Number)

  const start = new Date(year, month - 1, day, hours, minutes)
  const end = new Date(
    start.getTime() + Number(values.durationMinutes) * 60_000,
  )

  return appointments.find((appointment) => {
    if (appointment.professionalId !== values.professionalId) return false
    // Horario liberado por cancelamento ou falta nao conta como conflito.
    if (appointment.status === 'canceled' || appointment.status === 'no_show') {
      return false
    }

    const existingStart = appointment.startsAt
    const existingEnd = new Date(
      existingStart.getTime() + appointment.durationMinutes * 60_000,
    )

    return start < existingEnd && end > existingStart
  })
}

/**
 * Modal de novo atendimento (AGENDA_DESIGN.md, secao "Modal de novo atendimento").
 * O foco preso, o Escape e a devolucao do foco ao gatilho vem do componente Modal.
 */
export function NewAppointmentModal({
  open,
  onOpenChange,
  patients,
  professionals,
  existingAppointments,
  defaultDate,
  defaultTime = '09:00',
  onSubmit,
}: NewAppointmentModalProps) {
  const patientListId = useId()

  const {
    register,
    handleSubmit,
    setError,
    reset,
    setValue,
    formState: { errors },
  } = useForm<NewAppointmentInput>({
    resolver: zodResolver(newAppointmentSchema),
    mode: 'onSubmit',
    defaultValues: {
      patientId: '',
      professionalId: '',
      type: '',
      date: defaultDate,
      time: defaultTime,
      durationMinutes: '30',
      status: 'scheduled',
      notes: '',
    },
  })

  const [isSubmitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function handleValidSubmit(values: NewAppointmentInput) {
    /*
     * Checagem LOCAL de conflito — feedback imediato, não garantia.
     *
     * Ela só enxerga os atendimentos que a tela carregou: o período visível,
     * do profissional que o usuário está vendo. Duas recepcionistas marcando
     * o mesmo horário ao mesmo tempo passam por aqui sem se ver.
     *
     * A garantia de verdade é uma constraint de exclusão no banco, e é A-02.
     * Enquanto ela não existe, o adapter já traduz `23P01`/`23505` em
     * "horário ocupado" — se a constraint estiver lá, o usuário recebe a
     * mensagem certa mesmo neste caminho.
     */
    const conflict = findConflict(values, existingAppointments)

    if (conflict) {
      setError('time', {
        type: 'conflict',
        message: appointmentMessages.conflict,
      })
      return
    }

    setSubmitting(true)
    setFormError(null)

    try {
      const failure = await onSubmit(values)

      if (failure) {
        setFormError(failure.message)

        for (const [field, message] of Object.entries(
          failure.fieldErrors ?? {},
        )) {
          setError(field as keyof NewAppointmentInput, {
            type: 'server',
            message,
          })
        }

        return
      }

      reset()
      onOpenChange(false)
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
      title="Novo atendimento"
      description="Preencha os dados para agendar."
      footer={
        <>
          <Button
            variant="secondary"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form="new-appointment-form"
            isLoading={isSubmitting}
          >
            {isSubmitting ? 'Salvando...' : 'Salvar atendimento'}
          </Button>
        </>
      }
    >
      <form
        id="new-appointment-form"
        noValidate
        onSubmit={handleSubmit(handleValidSubmit)}
        className="flex flex-col gap-4"
      >
        {/* Recusa do servidor: anunciada, não só pintada de vermelho */}
        {formError ? (
          <p
            role="alert"
            className="rounded-card border border-danger/30 bg-danger/5 px-3.5 py-2.5 text-aux text-danger"
          >
            {formError}
          </p>
        ) : null}

        {/*
          Busca por nome com datalist nativo: acessivel e sem JS extra.
          Com a base real (milhares de pacientes) isto vira um combobox com busca
          no servidor — o contrato do campo nao muda.
        */}
        <div>
          <TextField
            label="Paciente"
            list={patientListId}
            placeholder="Buscar por nome"
            autoComplete="off"
            error={errors.patientId?.message}
            onChange={(event) => {
              const match = patients.find(
                (patient) => patient.name === event.target.value,
              )
              setValue('patientId', match?.id ?? '', { shouldValidate: false })
            }}
          />
          <datalist id={patientListId}>
            {patients.map((patient) => (
              <option key={patient.id} value={patient.name} />
            ))}
          </datalist>
          <input type="hidden" {...register('patientId')} />
        </div>

        <SelectField
          label="Profissional"
          error={errors.professionalId?.message}
          options={[
            { value: '', label: 'Selecione um profissional' },
            ...professionals.map((professional) => ({
              value: professional.id,
              label: `${professional.name} · ${professional.specialty}`,
            })),
          ]}
          {...register('professionalId')}
        />

        <TextField
          label="Tipo de atendimento"
          placeholder="Consulta de rotina, retorno..."
          error={errors.type?.message}
          {...register('type')}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Data"
            type="date"
            error={errors.date?.message}
            {...register('date')}
          />
          <TextField
            label="Horário de início"
            type="time"
            error={errors.time?.message}
            {...register('time')}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Duração"
            options={durationOptions}
            {...register('durationMinutes')}
          />
          <SelectField
            label="Status inicial"
            options={appointmentStatusOptions}
            {...register('status')}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="appointment-notes"
            className="text-label font-semibold text-label"
          >
            Observação (opcional)
          </label>
          <textarea
            id="appointment-notes"
            rows={3}
            placeholder="Algo importante para este atendimento?"
            className="w-full rounded-field border border-border-default bg-surface px-4 py-3 text-control text-foreground placeholder:text-muted transition-colors hover:border-border-hover focus:border-focus focus:shadow-focus focus:outline-none"
            {...register('notes')}
          />
        </div>
      </form>
    </Modal>
  )
}
