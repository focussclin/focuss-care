'use client'

import {
  CheckCircle2,
  Clock3,
  LogIn,
  Stethoscope,
  UserRoundCheck,
  Users,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { StatCard } from '@/components/ui/stat-card'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { formatTime } from '@/lib/utils/date'

import { callPatientAction } from '../actions/callPatient.action'
import { closeEncounterAction } from '../actions/closeEncounter.action'
import { startEncounterAction } from '../actions/startEncounter.action'
import { ChiefComplaintField } from './ChiefComplaintField'
import {
  encounterMessages,
  type EncounterDto,
  type QueueEntryDto,
} from '../schemas/encounter.schema'
import { CheckInModal, type CheckInOption } from './CheckInModal'

export interface AtendimentosScreenProps {
  queue: readonly QueueEntryDto[]
  openEncounters: readonly EncounterDto[]
  /**
   * Quem tem `record.write` pode registrar a queixa principal (E-03).
   *
   * A recepcao opera esta tela e NAO tem a permissao: para ela o campo nem
   * aparece. Esconder e cortesia — a recusa de verdade e do servidor.
   */
  canWriteChiefComplaint?: boolean
  closedEncounters: readonly EncounterDto[]
  metrics: { waiting: number; inService: number; closedToday: number }
  /** Pacientes para o check-in de encaixe. */
  patients: readonly CheckInOption[]
  professionals: readonly CheckInOption[]
  /**
   * Ha banco por tras desta tela.
   *
   * Falso significa demonstracao local: as Server Actions NAO sao chamadas e a
   * tela diz isso, em vez de simular um check-in que nao existe.
   */
  isLive?: boolean
}

const queueStatusMeta: Record<string, { label: string; tone: StatusTone }> = {
  waiting: { label: 'Aguardando', tone: 'pending' },
  called: { label: 'Chamado', tone: 'pending' },
  in_service: { label: 'Em atendimento', tone: 'positive' },
  done: { label: 'Concluído', tone: 'neutral' },
  abandoned: { label: 'Não compareceu', tone: 'negative' },
}

/** Espera em minutos, arredondada — a recepção não precisa de segundos. */
function waitedMinutes(arrivedAt: string, now: number): number {
  return Math.max(Math.round((now - new Date(arrivedAt).getTime()) / 60_000), 0)
}

/**
 * Fila e atendimentos do dia — feature **E-01**.
 *
 * Substitui a tela de vitrine que vivia em `OperationsScreens.tsx` com dados
 * literais e botões `disabled`.
 *
 * A tela **não filtra e não pagina**: renderiza o dia que o servidor mandou.
 * Uma fila de sala de espera não tem tamanho de paginar, e filtrar em memória
 * daria a mesma ilusão que a listagem de pacientes tinha antes de P-02a.
 */
export function AtendimentosScreen({
  queue,
  openEncounters,
  closedEncounters,
  canWriteChiefComplaint = false,
  metrics,
  patients,
  professionals,
  isLive = false,
}: AtendimentosScreenProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [isCheckingIn, setCheckingIn] = useState(false)

  /*
   * `now` é fixado no primeiro render, de propósito.
   *
   * A alternativa — um relógio vivo — faria o tempo de espera subir sozinho na
   * tela e provocaria hydration mismatch, porque servidor e cliente leriam
   * instantes diferentes. A recepção atualiza a página; o número vem do
   * servidor junto com a fila.
   */
  const [now] = useState(() => Date.now())

  const waitingEntries = queue.filter(
    (entry) => entry.status === 'waiting' || entry.status === 'called',
  )

  function run(operation: () => Promise<{ ok: boolean; error?: { message: string } }>) {
    setError(null)

    startTransition(async () => {
      try {
        const result = await operation()

        if (!result.ok) {
          setError(result.error?.message ?? encounterMessages.unexpected)
          return
        }

        router.refresh()
      } catch {
        setError(encounterMessages.unavailable)
      }
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Operação da clínica"
        title="Atendimentos"
        description="Acompanhe o que está acontecendo agora e mantenha a fila organizada."
        actions={
          <Button
            className="max-md:w-full"
            onClick={() => setCheckingIn(true)}
            disabled={!isLive}
            title={
              isLive
                ? undefined
                : 'Modo demonstração: o check-in exige banco configurado.'
            }
          >
            <LogIn aria-hidden className="size-4" strokeWidth={2.25} />
            Registrar chegada
          </Button>
        }
      />

      {/* Demonstração se anuncia: vitrine parecendo produto é o R11 */}
      {isLive ? null : (
        <p
          role="status"
          className="rounded-card border border-border-card bg-surface px-4 py-3 text-aux text-muted"
        >
          Modo demonstração: a fila abaixo é derivada da agenda de exemplo e
          nenhuma ação é salva.
        </p>
      )}

      <section aria-label="Resumo do dia">
        <div className="grid grid-cols-2 gap-4 nav:grid-cols-3">
          <StatCard
            label="Na fila"
            value={String(metrics.waiting)}
            icon={Clock3}
            tone="attention"
          />
          <StatCard
            label="Em atendimento"
            value={String(metrics.inService)}
            icon={Stethoscope}
          />
          <StatCard
            label="Concluídos hoje"
            value={String(metrics.closedToday)}
            icon={CheckCircle2}
          />
        </div>
      </section>

      {error ? (
        <p
          role="alert"
          className="rounded-card border border-danger/30 bg-danger-surface px-4 py-3 text-aux text-danger"
        >
          {error}
        </p>
      ) : null}

      <section aria-label="Fila de espera" className="flex flex-col gap-3">
        <h2 className="text-body font-semibold text-foreground">
          Fila de espera
        </h2>

        <Card className="overflow-hidden">
          {waitingEntries.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Ninguém aguardando no momento."
              description="Quando um paciente chegar, registre a chegada para entrar na fila."
            />
          ) : (
            <ul className="flex flex-col divide-y divide-border-card">
              {waitingEntries.map((entry) => {
                const meta = queueStatusMeta[entry.status]

                return (
                  <li
                    key={entry.id}
                    className="flex min-h-[72px] flex-wrap items-center gap-3 px-5 py-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-aux font-semibold text-foreground">
                        {entry.patientName}
                      </p>
                      <p className="truncate text-label text-muted">
                        Chegou às {formatTime(new Date(entry.arrivedAt))} ·{' '}
                        {waitedMinutes(entry.arrivedAt, now)} min de espera
                        {entry.professionalName
                          ? ` · ${entry.professionalName}`
                          : ''}
                        {/* Encaixe é rotina de clínica, e a fila diz isso */}
                        {entry.appointmentId === null ? ' · encaixe' : ''}
                      </p>
                    </div>

                    {meta ? (
                      <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                    ) : null}

                    <div className="flex items-center gap-2">
                      {entry.status === 'waiting' ? (
                        <Button
                          variant="secondary"
                          disabled={!isLive || isPending}
                          onClick={() =>
                            run(() =>
                              callPatientAction({ queueEntryId: entry.id }),
                            )
                          }
                        >
                          Chamar
                        </Button>
                      ) : null}

                      <Button
                        disabled={
                          !isLive ||
                          isPending ||
                          // Sem profissional definido não há atendimento para
                          // iniciar: o encounter exige um.
                          (entry.professionalId === null &&
                            professionals.length === 0)
                        }
                        onClick={() =>
                          run(() =>
                            startEncounterAction({
                              queueEntryId: entry.id,
                              professionalId:
                                entry.professionalId ?? professionals[0]?.id,
                            }),
                          )
                        }
                      >
                        <UserRoundCheck aria-hidden className="size-4" />
                        Iniciar
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </section>

      <section aria-label="Em atendimento" className="flex flex-col gap-3">
        <h2 className="text-body font-semibold text-foreground">
          Em atendimento
        </h2>

        <Card className="overflow-hidden">
          {openEncounters.length === 0 ? (
            <EmptyState
              icon={Stethoscope}
              title="Nenhum atendimento em curso."
            />
          ) : (
            <ul className="flex flex-col divide-y divide-border-card">
              {openEncounters.map((encounter) => (
                <li
                  key={encounter.id}
                  className="flex min-h-[72px] flex-wrap items-center gap-3 px-5 py-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-aux font-semibold text-foreground">
                      {encounter.patientName}
                    </p>
                    <p className="truncate text-label text-muted">
                      Com {encounter.professionalName} · início às{' '}
                      {formatTime(new Date(encounter.startsAt))}
                    </p>

                    {/*
                      A queixa so existe no DTO para quem tem `record.read` —
                      `undefined` e "este papel nao ve", `null` e "ninguem
                      registrou". A distincao evita oferecer um campo que o
                      servidor recusaria.
                    */}
                    {encounter.chiefComplaint !== undefined ? (
                      <ChiefComplaintField
                        encounterId={encounter.id}
                        value={encounter.chiefComplaint}
                        canWrite={canWriteChiefComplaint && isLive}
                        disabled={isPending}
                      />
                    ) : null}
                  </div>

                  <StatusBadge tone="positive">Em atendimento</StatusBadge>

                  <Button
                    variant="secondary"
                    disabled={!isLive || isPending}
                    onClick={() =>
                      run(() =>
                        closeEncounterAction({ encounterId: encounter.id }),
                      )
                    }
                  >
                    Encerrar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {closedEncounters.length > 0 ? (
        <section aria-label="Concluídos hoje" className="flex flex-col gap-3">
          <h2 className="text-body font-semibold text-foreground">
            Concluídos hoje
          </h2>

          <Card className="overflow-hidden">
            <ul className="flex flex-col divide-y divide-border-card">
              {closedEncounters.map((encounter) => (
                <li
                  key={encounter.id}
                  className="flex min-h-[60px] flex-wrap items-center gap-3 px-5 py-3"
                >
                  <p className="min-w-0 flex-1 truncate text-aux text-foreground">
                    {encounter.patientName}
                  </p>
                  <p className="text-label text-muted">
                    {formatTime(new Date(encounter.startsAt))}
                    {encounter.endedAt
                      ? ` – ${formatTime(new Date(encounter.endedAt))}`
                      : ''}
                  </p>
                  <StatusBadge tone="neutral">Concluído</StatusBadge>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      <CheckInModal
        open={isCheckingIn}
        onOpenChange={setCheckingIn}
        patients={patients}
        professionals={professionals}
        onDone={() => router.refresh()}
      />
    </div>
  )
}
