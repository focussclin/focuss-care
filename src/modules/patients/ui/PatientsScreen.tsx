'use client'

import { CheckCircle2, ChevronLeft, ChevronRight, Plus, SearchX, UserPlus, Users } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { IconButton } from '@/components/ui/icon-button'
import { StatCard } from '@/components/ui/stat-card'
import { addDays } from '@/lib/utils/date'
import type { Patient } from '@/modules/_shared/domain/types'

import type {
  LastVisitFilter,
  NewPatientInput,
  StatusFilter,
} from '../schemas/patient.schema'
import { NewPatientModal } from './NewPatientModal'
import { PatientCardList } from './PatientCardList'
import { PatientFilters } from './PatientFilters'
import { PatientsTable } from './PatientsTable'

export interface PatientsScreenProps {
  today: Date
  initialPatients: readonly Patient[]
  metrics: {
    total: number
    newThisMonth: number
    pendingAppointments: number
  }
  openNewOnMount?: boolean
}

const PAGE_SIZE = 8

export function PatientsScreen({
  today,
  initialPatients,
  metrics,
  openNewOnMount = false,
}: PatientsScreenProps) {
  const [patients, setPatients] = useState<Patient[]>(() => [
    ...initialPatients,
  ])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [lastVisit, setLastVisit] = useState<LastVisitFilter>('any')
  const [page, setPage] = useState(1)
  const [isCreating, setCreating] = useState(openNewOnMount)
  const [justCreated, setJustCreated] = useState<Patient | null>(null)

  const hasFilters =
    search.trim().length > 0 || status !== 'all' || lastVisit !== 'any'

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    const thirtyDaysAgo = addDays(today, -30)
    const ninetyDaysAgo = addDays(today, -90)

    return patients.filter((patient) => {
      const matchesSearch =
        term.length === 0 ||
        patient.name.toLowerCase().includes(term) ||
        patient.email.toLowerCase().includes(term) ||
        patient.phone.replace(/\D/g, '').includes(term.replace(/\D/g, ''))

      const matchesStatus =
        status === 'all' ||
        (status === 'active' && patient.status !== 'inactive') ||
        (status === 'inactive' && patient.status === 'inactive')

      const matchesLastVisit =
        lastVisit === 'any' ||
        (lastVisit === 'last-30' &&
          patient.lastVisitAt !== null &&
          patient.lastVisitAt >= thirtyDaysAgo) ||
        (lastVisit === 'over-90' &&
          (patient.lastVisitAt === null ||
            patient.lastVisitAt < ninetyDaysAgo))

      return matchesSearch && matchesStatus && matchesLastVisit
    })
  }, [lastVisit, patients, search, status, today])

  const totalPages = Math.max(Math.ceil(filtered.length / PAGE_SIZE), 1)
  const currentPage = Math.min(page, totalPages)
  const pageItems = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  )

  function clearFilters() {
    setSearch('')
    setStatus('all')
    setLastVisit('any')
    setPage(1)
  }

  function handleCreate(values: NewPatientInput) {
    const created: Patient = {
      id: `pat-local-${patients.length + 1}`,
      name: values.name,
      email: values.email ?? '',
      phone: values.phone,
      birthDate: values.birthDate ? new Date(values.birthDate) : new Date(),
      contactPreference: values.contactPreference,
      status: 'active',
      createdAt: today,
      lastVisitAt: null,
      nextVisitAt: null,
    }

    setPatients((current) => [created, ...current])
    setJustCreated(created)
    setPage(1)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Gestão da clínica"
        title="Pacientes"
        description="Acompanhe os pacientes e seus próximos cuidados."
        actions={
          <Button
            className="max-md:w-full"
            onClick={() => setCreating(true)}
          >
            <Plus aria-hidden className="size-4" strokeWidth={2.25} />
            Novo paciente
          </Button>
        }
      />

      {/* Confirmacao breve apos o cadastro, com as duas acoes do handoff */}
      {justCreated ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-3 rounded-card border border-status-positive-surface bg-status-positive-surface px-4 py-3"
        >
          <CheckCircle2
            aria-hidden
            className="size-4 shrink-0 text-status-positive"
          />
          <p className="flex-1 text-aux text-status-positive">
            <span className="font-semibold">{justCreated.name}</span> foi
            cadastrado com sucesso.
          </p>
          <div className="flex items-center gap-2">
            <Button asChild variant="secondary">
              <Link href={`/pacientes/${justCreated.id}`}>Ver perfil</Link>
            </Button>
            <Button asChild>
              <Link href="/agenda?novo=1">Agendar atendimento</Link>
            </Button>
          </div>
        </div>
      ) : null}

      <section aria-label="Resumo de pacientes">
        <div className="grid grid-cols-2 gap-4 nav:grid-cols-3">
          <StatCard
            label="Total de pacientes"
            value={metrics.total.toLocaleString('pt-BR')}
            icon={Users}
          />
          <StatCard
            label="Novos este mês"
            value={String(metrics.newThisMonth)}
            icon={UserPlus}
          />
          <StatCard
            label="Atendimentos pendentes"
            value={String(metrics.pendingAppointments)}
            icon={CheckCircle2}
            tone="attention"
          />
        </div>
      </section>

      <PatientFilters
        search={search}
        onSearchChange={(value) => {
          setSearch(value)
          setPage(1)
        }}
        status={status}
        onStatusChange={(value) => {
          setStatus(value)
          setPage(1)
        }}
        lastVisit={lastVisit}
        onLastVisitChange={(value) => {
          setLastVisit(value)
          setPage(1)
        }}
        onClear={clearFilters}
      />

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          hasFilters ? (
            <EmptyState
              icon={SearchX}
              title="Não encontramos pacientes com esses dados."
              action={
                <Button variant="secondary" onClick={clearFilters}>
                  Limpar busca
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={Users}
              title="Ainda não há pacientes cadastrados."
              action={
                <Button onClick={() => setCreating(true)}>
                  <Plus aria-hidden className="size-4" />
                  Cadastrar primeiro paciente
                </Button>
              }
            />
          )
        ) : (
          <>
            {/* Tabela a partir de 1024px, cards verticais abaixo disso */}
            <div className="hidden lg:block">
              <PatientsTable patients={pageItems} />
            </div>
            <div className="lg:hidden">
              <PatientCardList patients={pageItems} />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-card px-5 py-3.5">
              <p className="text-label text-muted">
                Mostrando{' '}
                <span className="font-semibold text-foreground">
                  {pageItems.length}
                </span>{' '}
                de{' '}
                <span className="font-semibold text-foreground">
                  {filtered.length}
                </span>{' '}
                {filtered.length === 1 ? 'paciente' : 'pacientes'}
              </p>

              <div className="flex items-center gap-1">
                <IconButton
                  label="Página anterior"
                  variant="outline"
                  disabled={currentPage === 1}
                  onClick={() => setPage((value) => Math.max(value - 1, 1))}
                >
                  <ChevronLeft aria-hidden className="size-4" />
                </IconButton>

                <span className="px-2 text-label text-muted tabular-nums">
                  {currentPage} / {totalPages}
                </span>

                <IconButton
                  label="Próxima página"
                  variant="outline"
                  disabled={currentPage === totalPages}
                  onClick={() =>
                    setPage((value) => Math.min(value + 1, totalPages))
                  }
                >
                  <ChevronRight aria-hidden className="size-4" />
                </IconButton>
              </div>
            </div>
          </>
        )}
      </Card>

      <NewPatientModal
        open={isCreating}
        onOpenChange={setCreating}
        onSubmit={handleCreate}
      />
    </div>
  )
}
