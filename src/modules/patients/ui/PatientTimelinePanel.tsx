import {
  Activity,
  CalendarDays,
  FileText,
  Paperclip,
  Pill,
  Stethoscope,
  type LucideIcon,
} from 'lucide-react'

import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { formatShortDate, formatTime } from '@/lib/utils/date'

import type { PatientEventKind } from '../domain/PatientTimeline'

export interface PatientTimelineEventDto {
  id: string
  kind: PatientEventKind
  /** ISO 8601 em UTC. */
  occurredAt: string
  title: string
  detail: string | null
  actor: string | null
}

export interface PatientTimelinePanelProps {
  events: readonly PatientTimelineEventDto[]
  /** Algum evento pode ter ficado de fora por permissão do papel. */
  isPartial?: boolean
}

const icons: Record<PatientEventKind, LucideIcon> = {
  appointment: CalendarDays,
  encounter: Stethoscope,
  record: FileText,
  prescription: Pill,
  vitals: Activity,
  document: Paperclip,
}

/**
 * Linha do tempo do paciente — a resposta que os oito painéis não davam.
 *
 * # Por que os eventos são agrupados por DIA
 *
 * "Terça, 12/08" é como quem atende lembra do que aconteceu: por dia, não por
 * hora. Uma lista corrida de trinta linhas com data em cada uma obriga a
 * comparar timestamps para perceber que três coisas foram da mesma consulta.
 *
 * # O que esta tela NÃO mostra
 *
 * Conteúdo. Nem o texto da evolução, nem o medicamento da receita, nem o valor
 * da pressão. Ela é o índice: diz que aconteceu, quando e por quem, e o painel
 * correspondente guarda o resto — cada um com a permissão e a auditoria que já
 * tem. Repetir o conteúdo aqui criaria uma segunda via fora daquelas travas.
 */
export function PatientTimelinePanel({
  events,
  isPartial = false,
}: PatientTimelinePanelProps) {
  const byDay = groupByDay(events)

  return (
    <Card className="overflow-hidden">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border-card px-5 py-4">
        <h2 className="text-control font-semibold text-foreground">
          Linha do tempo
        </h2>
        <p className="text-label text-muted">
          O que aconteceu com este paciente, em ordem.
        </p>
      </header>

      {events.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title="Nada registrado ainda."
          description="Consultas, atendimentos, evoluções e documentos aparecem aqui em ordem."
        />
      ) : (
        <div className="flex flex-col gap-5 px-5 py-4">
          {byDay.map(([day, dayEvents]) => (
            <section key={day} aria-label={day}>
              <h3 className="text-label font-semibold text-muted">{day}</h3>

              <ol className="mt-2 flex flex-col">
                {dayEvents.map((event) => {
                  const Icon = icons[event.kind]

                  return (
                    <li
                      key={event.id}
                      className="flex gap-3 border-l border-border-card py-2 pl-4"
                    >
                      <Icon
                        aria-hidden
                        className="mt-0.5 size-4 shrink-0 text-muted"
                      />
                      <div className="min-w-0">
                        <p className="text-aux text-foreground">
                          {event.title}
                          <span className="text-muted">
                            {' · '}
                            {formatTime(new Date(event.occurredAt))}
                          </span>
                        </p>
                        {event.detail ? (
                          <p className="mt-0.5 text-label break-words text-muted">
                            {event.detail}
                          </p>
                        ) : null}
                        {event.actor ? (
                          <p className="mt-0.5 text-label text-muted">
                            {event.actor}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ol>
            </section>
          ))}
        </div>
      )}

      {isPartial ? (
        /*
          Dizer que a lista é parcial é o que a impede de mentir por omissão:
          sem este aviso, quem não tem acesso clínico leria uma linha do tempo
          sem evoluções e concluiria que não houve nenhuma.
        */
        <p className="border-t border-border-card px-5 py-3 text-label text-muted">
          Seu perfil não vê registros clínicos: evoluções, prescrições e sinais
          vitais não aparecem nesta lista.
        </p>
      ) : null}
    </Card>
  )
}

/** 'Ter, 12/08' -> eventos daquele dia, preservando a ordem recebida. */
function groupByDay(
  events: readonly PatientTimelineEventDto[],
): [string, PatientTimelineEventDto[]][] {
  const groups = new Map<string, PatientTimelineEventDto[]>()

  for (const event of events) {
    const day = formatShortDate(new Date(event.occurredAt))
    const bucket = groups.get(day)

    if (bucket) bucket.push(event)
    else groups.set(day, [event])
  }

  return [...groups.entries()]
}
