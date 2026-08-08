'use client'

import { CalendarPlus, CalendarX2, Plus, SearchX } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import {
  addDays,
  formatFullDate,
  isSameDay,
  startOfDay,
  startOfWeek,
} from '@/lib/utils/date'
import type {
  Appointment,
  Patient,
  Professional,
} from '@/modules/_shared/domain/types'

import { cancelAppointmentAction } from '../actions/cancelAppointment.action'
import { createAppointmentAction } from '../actions/createAppointment.action'
import { rescheduleAppointmentAction } from '../actions/rescheduleAppointment.action'
import {
  scheduleMessages,
  type AppointmentDto,
  type NewAppointmentInput,
} from '../schemas/appointment.schema'
import { AgendaControlBar, type AgendaView } from './AgendaControlBar'
import { AppointmentDetailsModal } from './AppointmentDetailsModal'
import { DayView } from './DayView'
import { ListView } from './ListView'
import {
  NewAppointmentModal,
  type AppointmentSubmitFailure,
} from './NewAppointmentModal'
import { WeekView } from './WeekView'

export interface AgendaScreenProps {
  today: Date
  initialAppointments: readonly Appointment[]
  patients: readonly Patient[]
  professionals: readonly Professional[]
  /** Abre o modal de criacao ja na entrada (link "+ Novo atendimento" do dashboard). */
  openNewOnMount?: boolean
  /**
   * Ha banco por tras desta tela.
   *
   * Falso significa demonstracao local (Supabase ausente do ambiente): o
   * atendimento vive na memoria da aba e a Server Action NAO e chamada.
   * Verdadeiro significa clinica real — todo agendamento persiste.
   */
  isLive?: boolean
}

/** yyyy-mm-dd para o input[type=date], sem passar por UTC. */
function toDateInputValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function AgendaScreen({
  today,
  initialAppointments,
  patients,
  professionals,
  openNewOnMount = false,
  isLive = false,
}: AgendaScreenProps) {
  const router = useRouter()
  /*
   * AGENDA_DESIGN.md: lista e o padrao ate 767px; semanal a partir de 1024px.
   * useMediaQuery devolve false no servidor, entao o HTML inicial e mobile-first.
   */
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  const [viewOverride, setViewOverride] = useState<AgendaView | null>(null)
  const view: AgendaView = viewOverride ?? (isDesktop ? 'week' : 'list')

  const [referenceDate, setReferenceDate] = useState(() => startOfDay(today))
  const [professionalId, setProfessionalId] = useState('all')
  const [search, setSearch] = useState('')

  const [appointments, setAppointments] = useState<Appointment[]>(() => [
    ...initialAppointments,
  ])
  const [selected, setSelected] = useState<Appointment | null>(null)
  const [isCreating, setCreating] = useState(openNewOnMount)
  const [createTime, setCreateTime] = useState('09:00')
  /** Recusa do cancelamento — exibida no modal de detalhes, não engolida. */
  const [cancelError, setCancelError] = useState<string | null>(null)
  /**
   * Atendimento sendo REMARCADO, ou null quando o formulário está criando.
   *
   * O mesmo formulário serve aos dois casos, e é o que decide qual action é
   * chamada no envio. Antes de A-01 "Remarcar" apenas reabria o formulário de
   * criação — inofensivo enquanto nada persistia, e um atendimento DUPLICADO a
   * partir do momento em que passou a persistir: o original ficaria no horário
   * antigo, e o paciente apareceria duas vezes na agenda.
   */
  const [reschedulingId, setReschedulingId] = useState<string | null>(null)

  const weekStart = useMemo(
    () => startOfWeek(referenceDate),
    [referenceDate],
  )

  const hasActiveFilters = professionalId !== 'all' || search.trim().length > 0

  /** Atendimentos do periodo visivel, antes dos filtros. */
  const periodAppointments = useMemo(() => {
    const inPeriod = (appointment: Appointment) => {
      if (view === 'day') return isSameDay(appointment.startsAt, referenceDate)

      const weekEnd = addDays(weekStart, 7)
      return (
        appointment.startsAt >= weekStart && appointment.startsAt < weekEnd
      )
    }

    return appointments
      .filter(inPeriod)
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
  }, [appointments, referenceDate, view, weekStart])

  const visibleAppointments = useMemo(() => {
    const term = search.trim().toLowerCase()

    return periodAppointments.filter((appointment) => {
      const matchesProfessional =
        professionalId === 'all' ||
        appointment.professionalId === professionalId

      const matchesSearch =
        term.length === 0 ||
        appointment.patientName.toLowerCase().includes(term)

      return matchesProfessional && matchesSearch
    })
  }, [periodAppointments, professionalId, search])

  const rangeLabel = useMemo(() => {
    if (view === 'day') return formatFullDate(referenceDate)

    const weekEnd = addDays(weekStart, 6)
    const startDay = String(weekStart.getDate()).padStart(2, '0')

    return `${startDay} – ${formatFullDate(weekEnd)}`
  }, [referenceDate, view, weekStart])

  function shiftPeriod(direction: 1 | -1) {
    const step = view === 'day' ? 1 : 7
    setReferenceDate((current) => addDays(current, direction * step))
  }

  /** Entidade a partir do que a Server Action devolveu (só escalares). */
  function fromDto(dto: AppointmentDto): Appointment {
    return {
      id: dto.id,
      patientId: dto.patientId,
      patientName: dto.patientName,
      professionalId: dto.professionalId,
      professionalName: dto.professionalName,
      type: dto.type,
      startsAt: new Date(dto.startsAt),
      durationMinutes: dto.durationMinutes,
      status: dto.status as Appointment['status'],
      notes: dto.notes,
    }
  }

  /**
   * Agendamento.
   *
   * Dois caminhos, e a diferença entre eles é a regra D8/R7 do roadmap:
   *
   *  - **Sem banco (`isLive` falso)** — demonstração local. A Server Action não
   *    é chamada, o atendimento vive na memória desta aba, e o aviso na tela diz
   *    isso. Vitrine que se parece com produto é o R11.
   *  - **Com banco** — `createAppointmentAction`. O modal só fecha depois que o
   *    servidor confirma, e a linha que entra na grade usa o `id` devolvido por
   *    ele. Falha não vira sucesso otimista.
   */
  async function handleCreate(
    values: NewAppointmentInput,
  ): Promise<AppointmentSubmitFailure | null> {
    // Remarcar move a MESMA linha; criar faz outra. Um formulário, duas actions.
    if (reschedulingId !== null) {
      return handleRescheduleSubmit(reschedulingId, values)
    }

    if (!isLive) {
      const [year, month, day] = values.date.split('-').map(Number)
      const [hours, minutes] = values.time.split(':').map(Number)
      const patient = patients.find((item) => item.id === values.patientId)
      const professional = professionals.find(
        (item) => item.id === values.professionalId,
      )

      setAppointments((current) => [
        ...current,
        {
          id: `apt-local-${current.length + 1}`,
          patientId: values.patientId,
          patientName: patient?.name ?? 'Paciente',
          professionalId: values.professionalId,
          professionalName: professional?.name ?? 'Profissional',
          type: values.type,
          startsAt: new Date(year, month - 1, day, hours, minutes),
          durationMinutes: Number(values.durationMinutes),
          status: values.status,
          notes: values.notes || undefined,
        },
      ])

      return null
    }

    try {
      const result = await createAppointmentAction({
        patientId: values.patientId,
        professionalId: values.professionalId,
        type: values.type,
        date: values.date,
        time: values.time,
        durationMinutes: values.durationMinutes,
        status: values.status,
        notes: values.notes,
      })

      if (!result.ok) {
        if (result.error.code === 'unauthenticated') {
          router.replace('/login?next=%2Fagenda')
          return null
        }

        if (result.error.code === 'no-active-clinic') {
          router.replace('/onboarding')
          return null
        }

        return {
          message: result.error.message,
          fieldErrors: result.error.fieldErrors,
        }
      }

      setAppointments((current) => [...current, fromDto(result.data)])

      // A grade já tem o atendimento novo. O refresh existe para o resto do
      // servidor: dashboard, contadores e qualquer tela em cache.
      router.refresh()

      return null
    } catch {
      // Falha de transporte: a Server Action nem chegou a responder.
      return { message: scheduleMessages.unavailable }
    }
  }

  /**
   * Cancelamento.
   *
   * Não remove da grade: o atendimento continua visível com o status trocado.
   * Sumir da tela sugeriria que a linha foi apagada, e cancelar é justamente o
   * oposto — o registro do que foi desmarcado é o que a clínica precisa ter.
   */
  async function handleCancel(appointment: Appointment) {
    if (!isLive) {
      setAppointments((current) =>
        current.map((item) =>
          item.id === appointment.id
            ? { ...item, status: 'canceled' as const }
            : item,
        ),
      )
      setSelected(null)
      return
    }

    setCancelError(null)

    const result = await cancelAppointmentAction({
      appointmentId: appointment.id,
    })

    if (!result.ok) {
      setCancelError(result.error.message)
      return
    }

    setAppointments((current) =>
      current.map((item) =>
        item.id === appointment.id ? fromDto(result.data) : item,
      ),
    )
    setSelected(null)
    router.refresh()
  }

  /**
   * Envio do formulário quando ele está REMARCANDO.
   *
   * Só data, hora e duração chegam ao servidor: remarcar não é reescrever o
   * atendimento. Trocar paciente ou profissional aqui seria cancelar um
   * atendimento e criar outro fingindo ser o mesmo — e o status confirmado
   * viajaria junto, dizendo que um paciente confirmou algo que nunca lhe foi
   * proposto.
   */
  async function handleRescheduleSubmit(
    appointmentId: string,
    values: NewAppointmentInput,
  ): Promise<AppointmentSubmitFailure | null> {
    if (!isLive) {
      const [year, month, day] = values.date.split('-').map(Number)
      const [hours, minutes] = values.time.split(':').map(Number)

      setAppointments((current) =>
        current.map((item) =>
          item.id === appointmentId
            ? {
                ...item,
                startsAt: new Date(year, month - 1, day, hours, minutes),
                durationMinutes: Number(values.durationMinutes),
              }
            : item,
        ),
      )
      setReschedulingId(null)
      return null
    }

    try {
      const result = await rescheduleAppointmentAction({
        appointmentId,
        date: values.date,
        time: values.time,
        durationMinutes: values.durationMinutes,
      })

      if (!result.ok) {
        return {
          message: result.error.message,
          fieldErrors: result.error.fieldErrors,
        }
      }

      setAppointments((current) =>
        current.map((item) =>
          item.id === appointmentId ? fromDto(result.data) : item,
        ),
      )
      setReschedulingId(null)
      router.refresh()

      return null
    } catch {
      return { message: scheduleMessages.unavailable }
    }
  }

  function handleReschedule(appointment: Appointment) {
    // O formulario reabre no horario de origem, mas agora MOVENDO a linha —
    // ver `reschedulingId`.
    setSelected(null)
    setReschedulingId(appointment.id)
    setCreateTime(
      `${String(appointment.startsAt.getHours()).padStart(2, '0')}:${String(appointment.startsAt.getMinutes()).padStart(2, '0')}`,
    )
    setCreating(true)
  }

  function clearFilters() {
    setProfessionalId('all')
    setSearch('')
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Agenda"
        title="Agenda"
        description="Organize os atendimentos da sua clínica."
        actions={
          <Button
            className="max-md:w-full"
            onClick={() => {
              setCreateTime('09:00')
              setCreating(true)
            }}
          >
            <Plus aria-hidden className="size-4" strokeWidth={2.25} />
            Novo atendimento
          </Button>
        }
      />

      <AgendaControlBar
        rangeLabel={rangeLabel}
        view={view}
        onViewChange={setViewOverride}
        onPrevious={() => shiftPeriod(-1)}
        onNext={() => shiftPeriod(1)}
        onToday={() => setReferenceDate(startOfDay(today))}
        professionals={professionals}
        professionalId={professionalId}
        onProfessionalChange={setProfessionalId}
        search={search}
        onSearchChange={setSearch}
      />

      {visibleAppointments.length === 0 && view === 'list' ? (
        <Card>
          {hasActiveFilters ? (
            <EmptyState
              icon={SearchX}
              title="Não encontramos atendimentos com esses filtros."
              action={
                <Button variant="secondary" onClick={clearFilters}>
                  Limpar filtros
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={CalendarX2}
              title="Nenhum atendimento neste período."
              action={
                <Button onClick={() => setCreating(true)}>
                  <CalendarPlus aria-hidden className="size-4" />
                  Criar atendimento
                </Button>
              }
            />
          )}
        </Card>
      ) : null}

      {view === 'week' ? (
        <WeekView
          weekStart={weekStart}
          today={today}
          appointments={visibleAppointments}
          onSelectAppointment={setSelected}
        />
      ) : null}

      {view === 'day' ? (
        <DayView
          date={referenceDate}
          today={today}
          appointments={visibleAppointments}
          onSelectAppointment={setSelected}
          onCreateAt={(time) => {
            setCreateTime(time)
            setCreating(true)
          }}
        />
      ) : null}

      {view === 'list' && visibleAppointments.length > 0 ? (
        <ListView
          appointments={visibleAppointments}
          today={today}
          onSelectAppointment={setSelected}
          onReschedule={handleReschedule}
          onCancel={handleCancel}
        />
      ) : null}

      {/*
        A key remonta o formulario quando a data ou o horario de origem mudam.
        Sem isso, os defaultValues do react-hook-form ficariam presos aos valores
        da primeira montagem e "adicionar as 14:00" abriria o modal com 09:00.
      */}
      <NewAppointmentModal
        key={`${reschedulingId ?? 'new'}-${toDateInputValue(referenceDate)}-${createTime}`}
        open={isCreating}
        onOpenChange={(open) => {
          setCreating(open)
          // Fechar o formulario abandona a remarcacao: reabri-lo depois cria.
          if (!open) setReschedulingId(null)
        }}
        patients={patients}
        professionals={professionals}
        existingAppointments={appointments}
        defaultDate={toDateInputValue(referenceDate)}
        defaultTime={createTime}
        onSubmit={handleCreate}
      />

      <AppointmentDetailsModal
        appointment={selected}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null)
            setCancelError(null)
          }
        }}
        onReschedule={handleReschedule}
        onCancel={handleCancel}
        cancelError={cancelError}
      />
    </div>
  )
}
