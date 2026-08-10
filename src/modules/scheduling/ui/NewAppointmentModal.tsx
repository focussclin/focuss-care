'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useState, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { SelectField } from '@/components/ui/select-field'
import { TextField } from '@/components/ui/text-field'
import type { Appointment, Professional } from '@/modules/_shared/domain/types'

import {
  appointmentMessages,
  appointmentStatusOptions,
  durationOptions,
  newAppointmentSchema,
  type NewAppointmentInput,
} from '../schemas/appointment.schema'

/**
 * O que o slot de paciente recebe do formulário.
 *
 * É função, e não `ReactNode`: o seletor precisa LER e ESCREVER o campo
 * `patientId`, e um nó pronto não teria como. É a diferença entre este slot e o
 * do seletor de clínicas, que só precisa ser renderizado.
 */
export type PatientFieldRenderer = (control: {
  value: string
  onChange: (patientId: string) => void
  error?: string
}) => ReactNode

export interface NewAppointmentModalProps {
  /** Seletor de paciente, montado pela rota — ver o uso no corpo do modal. */
  renderPatientField: PatientFieldRenderer
  open: boolean
  onOpenChange: (open: boolean) => void
  professionals: readonly Professional[]
  /** Base para detectar conflito de horario antes de salvar. */
  existingAppointments: readonly Appointment[]
  defaultDate: string
  defaultTime?: string
  /**
   * Duração que o formulário abre selecionada.
   *
   * Vem da configuração da clínica (C-01). Valor fora de `durationOptions` cai
   * na primeira opção da lista: as duas listas vivem em módulos diferentes, e
   * uma divergência entre elas não pode deixar o campo sem seleção.
   */
  defaultDurationMinutes?: number
  /**
   * Envio.
   *
   * Devolve `null` em caso de sucesso, ou a falha para o formulário exibir.
   * O modal **só fecha depois que o servidor confirma** — fechar antes daria
   * "agendado" para algo que pode ter sido recusado.
   */
  onSubmit: (
    values: NewAppointmentInput,
    options?: AppointmentSubmitOptions,
  ) => Promise<AppointmentSubmitFailure | null>
}

/** Decisões que acompanham o envio, e não são campos do formulário (A-02). */
export interface AppointmentSubmitOptions {
  /** A pessoa viu o aviso de horário fora do expediente e confirmou. */
  confirmOutsideBusinessHours?: boolean
}

export interface AppointmentSubmitFailure {
  /** Mensagem global, exibida no topo do formulário. */
  message: string
  /** Erro por campo, quando o servidor sabe qual recusou. */
  fieldErrors?: Partial<Record<keyof NewAppointmentInput, string>>
  /**
   * A operação é possível e depende de confirmação — feature **A-02**.
   *
   * Quando verdadeiro, a mensagem NÃO é uma recusa: o formulário precisa
   * oferecer o caminho de seguir mesmo assim. Tratá-la como erro comum faria a
   * recepção mudar a hora do agendamento para conseguir salvar, que é
   * exatamente o dado que a agenda não pode perder.
   */
  needsConfirmation?: boolean
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
  professionals,
  existingAppointments,
  defaultDate,
  defaultTime = '09:00',
  defaultDurationMinutes = 30,
  renderPatientField,
  onSubmit,
}: NewAppointmentModalProps) {
  const initialDuration = durationOptions.some(
    (option) => option.value === String(defaultDurationMinutes),
  )
    ? String(defaultDurationMinutes)
    : durationOptions[0].value

  const {
    register,
    handleSubmit,
    setError,
    reset,
    setValue,
    control,
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
      durationMinutes: initialDuration,
      status: 'scheduled',
      notes: '',
    },
  })

  /*
   * `useWatch` e nao `watch()`: o segundo devolve uma funcao que o React
   * Compiler nao consegue memoizar, e usa-lo aqui desligaria a compilacao do
   * modal inteiro. O primeiro assina UM campo e devolve o valor.
   */
  const patientId = useWatch({ control, name: 'patientId' })

  const [isSubmitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  /**
   * Aviso de horário fora do expediente aguardando decisão (A-02).
   *
   * Guarda a mensagem E os valores enviados: confirmar precisa reenviar
   * exatamente o que o servidor avaliou, não o que estiver no formulário no
   * momento do clique.
   */
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    message: string
    values: NewAppointmentInput
  } | null>(null)

  async function submitTo(
    values: NewAppointmentInput,
    options?: AppointmentSubmitOptions,
  ): Promise<void> {
    setSubmitting(true)
    setFormError(null)

    try {
      const failure = await onSubmit(values, options)

      if (failure) {
        if (failure.needsConfirmation) {
          // Não é erro: é pergunta. Fica em estado próprio para que o rodapé
          // troque o botão "Salvar" pela decisão.
          setPendingConfirmation({ message: failure.message, values })
          return
        }

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
      setPendingConfirmation(null)
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleValidSubmit(values: NewAppointmentInput) {
    /*
     * Checagem LOCAL de conflito — feedback imediato, não garantia.
     *
     * Ela só enxerga os atendimentos que a tela carregou: o período visível,
     * do profissional que o usuário está vendo. Duas recepcionistas marcando
     * o mesmo horário ao mesmo tempo passam por aqui sem se ver.
     *
     * Continua valendo depois de **A-02**, e agora como o que sempre foi: um
     * atalho de interface. A verificação que decide é a do servidor, que
     * consulta o banco antes de escrever — esta só evita a ida até lá quando o
     * choque já é visível na tela.
     */
    const conflict = findConflict(values, existingAppointments)

    if (conflict) {
      setError('time', {
        type: 'conflict',
        message: appointmentMessages.conflict,
      })
      return
    }

    setPendingConfirmation(null)
    await submitTo(values)
  }

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset()
          setPendingConfirmation(null)
        }
        onOpenChange(next)
      }}
      title="Novo atendimento"
      description="Preencha os dados para agendar."
      footer={
        pendingConfirmation ? (
          /*
           * O rodapé muda quando há decisão pendente (A-02).
           *
           * "Salvar" continuar ali, ao lado de um aviso, faria a pessoa clicar
           * de novo sem entender por que o primeiro clique não bastou. Aqui as
           * duas saídas são explícitas, e a que volta ao formulário é a
           * primária: mudar o horário é o desfecho mais provável.
           */
          <>
            <Button
              variant="secondary"
              onClick={() =>
                submitTo(pendingConfirmation.values, {
                  confirmOutsideBusinessHours: true,
                })
              }
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Salvando...' : 'Agendar mesmo assim'}
            </Button>
            <Button
              onClick={() => setPendingConfirmation(null)}
              disabled={isSubmitting}
            >
              Escolher outro horário
            </Button>
          </>
        ) : (
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
        )
      }
    >
      <form
        id="new-appointment-form"
        noValidate
        onSubmit={handleSubmit(handleValidSubmit)}
        className="flex flex-col gap-4"
      >
        {/*
          Aviso que espera decisão (A-02) — em tom de atenção, não de erro.
          Vermelho diria "você errou"; o horário fora do expediente é uma
          escolha legítima, e quem agenda é quem sabe se cabe.
        */}
        {pendingConfirmation ? (
          <p
            role="alert"
            className="rounded-card border border-border-card bg-background px-3.5 py-2.5 text-aux text-foreground"
          >
            {pendingConfirmation.message}
          </p>
        ) : null}

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
          O seletor de paciente vem de FORA, como slot.

          Ele busca no servidor e pertence ao módulo `patients`; este modal é do
          `scheduling`, e a regra 4 impede um módulo de alcançar o interior do
          outro. A rota monta os dois — é o mesmo desenho do seletor de clínicas
          na casca da aplicação, com uma diferença: aqui o slot precisa do estado
          do formulário, então recebe valor, setter e erro.

          O que este arquivo NÃO faz mais: filtrar no cliente. A lista chegava
          com as 50 primeiras pessoas da clínica e o `datalist` filtrava aqui —
          procurar alguém fora dessas 50 não devolvia nada, e a tela não dizia
          que estava procurando num pedaço.
        */}
        {renderPatientField({
          value: patientId,
          onChange: (patientId) =>
            setValue('patientId', patientId, { shouldValidate: false }),
          error: errors.patientId?.message,
        })}
        <input type="hidden" {...register('patientId')} />

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
