'use client'

import { CalendarPlus, CalendarX2, Plus, SearchX } from 'lucide-react'
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

import type { NewAppointmentInput } from '../schemas/appointment.schema'
import { AgendaControlBar, type AgendaView } from './AgendaControlBar'
import { AppointmentDetailsModal } from './AppointmentDetailsModal'
import { DayView } from './DayView'
import { ListView } from './ListView'
import { NewAppointmentModal } from './NewAppointmentModal'
import { WeekView } from './WeekView'

export interface AgendaScreenProps {
  today: Date
  initialAppointments: readonly Appointment[]
  patients: readonly Patient[]
  professionals: readonly Professional[]
  /** Abre o modal de criacao ja na entrada (link "+ Novo atendimento" do dashboard). */
  openNewOnMount?: boolean
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
}: AgendaScreenProps) {
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

  function handleCreate(values: NewAppointmentInput) {
    const [year, month, day] = values.date.split('-').map(Number)
    const [hours, minutes] = values.time.split(':').map(Number)
    const patient = patients.find((item) => item.id === values.patientId)
    const professional = professionals.find(
      (item) => item.id === values.professionalId,
    )

    const created: Appointment = {
      id: `apt-local-${appointments.length + 1}`,
      patientId: values.patientId,
      patientName: patient?.name ?? 'Paciente',
      professionalId: values.professionalId,
      professionalName: professional?.name ?? 'Profissional',
      type: values.type,
      startsAt: new Date(year, month - 1, day, hours, minutes),
      durationMinutes: Number(values.durationMinutes),
      status: values.status,
      notes: values.notes || undefined,
    }

    setAppointments((current) => [...current, created])
  }

  function handleCancel(appointment: Appointment) {
    setAppointments((current) =>
      current.map((item) =>
        item.id === appointment.id
          ? { ...item, status: 'canceled' as const }
          : item,
      ),
    )
  }

  function handleReschedule(appointment: Appointment) {
    // Reagendar reabre o formulario com o horario de origem como ponto de partida.
    setSelected(null)
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
        key={`${toDateInputValue(referenceDate)}-${createTime}`}
        open={isCreating}
        onOpenChange={setCreating}
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
          if (!open) setSelected(null)
        }}
        onReschedule={handleReschedule}
        onCancel={handleCancel}
      />
    </div>
  )
}
