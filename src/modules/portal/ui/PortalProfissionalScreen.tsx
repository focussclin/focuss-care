import {
  CalendarCheck2,
  CalendarClock,
  CheckSquare2,
  ClipboardList,
  IdCard,
  TriangleAlert,
} from 'lucide-react'
import Link from 'next/link'

import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { StatCard } from '@/components/ui/stat-card'
import { StatusBadge } from '@/components/ui/status-badge'

import { portalMessages } from '../schemas/portal.schema'
import type { PortalAppointmentDto } from '../schemas/portal.schema'
import type { PortalProfissionalScreenProps } from './PortalProfissionalScreen.props'

/**
 * O dia de quem atende — feature **Portal do profissional**.
 *
 * # Por que não é `/agenda` com um filtro
 *
 * `/agenda` é a mesa da recepção: mostra a clínica inteira porque quem marca
 * precisa comparar profissionais para encaixar. Quem atende não usa nada disso
 * e paga por ele — abre uma grade de cinco colunas, procura o próprio nome, e
 * faz isso de pé, entre um paciente e outro.
 *
 * Esta tela responde uma pergunta só: **o que eu tenho pela frente agora**.
 *
 * # Server Component de propósito
 *
 * Não há `'use client'` aqui, e não há estado: tudo é leitura, e a única
 * interação é navegar. Marcar como cliente custaria hidratação em toda abertura
 * para não ganhar nada — e criaria a fronteira em que funções não atravessam,
 * que é o defeito que `serverBoundaryProps.test.ts` existe para pegar.
 */
export function PortalProfissionalScreen({
  greetingName,
  dayLabel,
  summary,
  current,
  unclosed,
  upcoming,
  finished,
  tasks,
  noProfessional,
  tasksSchemaPending,
  isLive,
}: PortalProfissionalScreenProps) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={dayLabel}
        title={`Seu dia, ${greetingName}`}
        description="Os atendimentos com você e as tarefas atribuídas a você — nada da clínica inteira."
        actions={
          <Button asChild variant="secondary">
            <Link href="/agenda">Ver a agenda da clínica</Link>
          </Button>
        }
      />

      {!isLive ? (
        <p
          role="status"
          className="rounded-card border border-attention/30 bg-attention-surface px-4 py-3 text-aux text-foreground"
        >
          {portalMessages.demo}
        </p>
      ) : null}

      {/*
        `no-professional` corta a tela ANTES da agenda, e não mostra zero.

        Um administrador que abre este endereço não tem agenda porque não
        atende, e não porque o dia está livre. "Nenhum atendimento hoje" seria
        verdade e mentira ao mesmo tempo: verdade sobre o número, mentira sobre
        o motivo — e o motivo é o que diz o que fazer a seguir.
      */}
      {noProfessional ? (
        <Card>
          <EmptyState
            icon={IdCard}
            title="Esta tela é de quem atende."
            description={portalMessages.noProfessional}
            action={
              <Button asChild variant="secondary">
                <Link href="/equipe">Abrir Equipe</Link>
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <section aria-label="Resumo do dia">
            <div className="grid grid-cols-2 gap-4 nav:grid-cols-4">
              <StatCard
                label="Pela frente"
                value={String(summary.remaining)}
                icon={CalendarClock}
              />
              <StatCard
                label="Encerrados hoje"
                value={String(summary.finished)}
                icon={CalendarCheck2}
              />
              <StatCard
                label="Tarefas suas"
                value={String(summary.openTasks)}
                icon={CheckSquare2}
              />
              <StatCard
                label="Tarefas vencidas"
                value={String(summary.overdueTasks)}
                icon={TriangleAlert}
                tone={summary.overdueTasks > 0 ? 'attention' : 'default'}
              />
            </div>
          </section>

          {current ? (
            <Card className="border-brand/30 bg-brand-subtle">
              <CardHeader title="Acontecendo agora" />
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-5 pb-5">
                <p className="text-metric font-semibold text-brand tabular-nums">
                  {current.windowLabel}
                </p>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/pacientes/${current.patientId}`}
                    className="block truncate text-card-title font-semibold text-link hover:underline"
                  >
                    {current.patientName}
                  </Link>
                  <p className="truncate text-aux text-muted">{current.type}</p>
                </div>
                <Button asChild>
                  <Link href="/atendimentos">Abrir atendimento</Link>
                </Button>
              </div>
            </Card>
          ) : null}

          {/*
            Este bloco existe para incomodar.

            Consulta que estoura o horário é rotina; o que não é rotina é ela
            continuar aberta — nesse estado ela não entra no faturamento e não
            libera a sala, e ninguém além de quem atendeu pode encerrar.
          */}
          {unclosed.length > 0 ? (
            <Card className="border-attention/40">
              <CardHeader
                title="Aguardando encerramento"
                description="Começaram e continuam abertos. Enquanto ficarem assim, não entram no faturamento."
              />
              <ul className="flex flex-col divide-y divide-border-card">
                {unclosed.map((appointment) => (
                  <AppointmentRow key={appointment.id} appointment={appointment} />
                ))}
              </ul>
            </Card>
          ) : null}

          <div className="grid gap-6 nav:grid-cols-[3fr_2fr]">
            <Card>
              <CardHeader title="A seguir" />

              {upcoming.length === 0 ? (
                <EmptyState
                  icon={CalendarCheck2}
                  title={
                    summary.finished > 0
                      ? 'Nada mais marcado para hoje.'
                      : 'Nenhum atendimento marcado para hoje.'
                  }
                  description={
                    summary.finished > 0
                      ? 'Os atendimentos de hoje já passaram.'
                      : 'Quando a recepção agendar alguém com você, aparece aqui.'
                  }
                />
              ) : (
                <ul className="flex flex-col divide-y divide-border-card">
                  {upcoming.map((appointment) => (
                    <AppointmentRow
                      key={appointment.id}
                      appointment={appointment}
                    />
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader
                title="Suas tarefas"
                description="Só as atribuídas a você e ainda abertas."
                action={
                  <Link
                    href="/tarefas"
                    className="text-label font-semibold text-link hover:underline"
                  >
                    Ver todas
                  </Link>
                }
              />

              {/*
                A pendência de schema é declarada AQUI, e não na tela inteira.

                A agenda acima é real e não depende de `clinic_tasks`. Derrubar
                o portal por causa do painel lateral trocaria uma ausência
                parcial por uma total.
              */}
              {tasksSchemaPending ? (
                <p
                  role="status"
                  className="mx-5 mb-5 rounded-field border border-attention/30 bg-attention-surface px-4 py-3 text-label leading-5 text-foreground"
                >
                  {portalMessages.tasksPending}
                </p>
              ) : tasks.length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title="Nenhuma tarefa atribuída a você."
                />
              ) : (
                <ul className="flex flex-col divide-y divide-border-card">
                  {tasks.map((task) => (
                    <li key={task.id} className="px-5 py-3">
                      <p className="text-aux font-medium text-foreground">
                        {task.title}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-label text-muted">
                        {task.patientName ? (
                          <span className="truncate">{task.patientName}</span>
                        ) : null}
                        {task.dueLabel ? (
                          <span
                            className={
                              task.isOverdue
                                ? 'font-semibold text-danger'
                                : undefined
                            }
                          >
                            {task.dueLabel}
                          </span>
                        ) : null}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/*
            Encerrados ficam por último e sem destaque — são o registro do que
            já foi feito, não trabalho pendente. Mas continuam na tela: cancelado
            e falta são informação que o profissional precisa ter, e sumir com
            eles faria o dia parecer menor do que foi.

            O título é "Já encerrados", e não "Encerrados hoje": o cartão de
            métrica acima já usa esse rótulo para a CONTAGEM. Dois elementos com
            o mesmo nome acessível na mesma página fazem quem navega por leitor
            de tela ouvir a mesma coisa duas vezes sem saber que uma é a conta e
            a outra é a lista.
          */}
          {finished.length > 0 ? (
            <Card>
              <CardHeader title="Já encerrados" />
              <ul className="flex flex-col divide-y divide-border-card">
                {finished.map((appointment) => (
                  <AppointmentRow key={appointment.id} appointment={appointment} />
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      )}
    </div>
  )
}

function AppointmentRow({
  appointment,
}: {
  appointment: PortalAppointmentDto
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
      <time
        dateTime={appointment.startsAt}
        className="w-16 shrink-0 text-aux font-semibold text-foreground tabular-nums"
      >
        {appointment.timeLabel}
      </time>

      <span className="min-w-0 flex-1">
        <Link
          href={`/pacientes/${appointment.patientId}`}
          className="block truncate text-aux font-medium text-link hover:underline"
        >
          {appointment.patientName}
        </Link>
        <span className="block truncate text-label text-muted">
          {appointment.type} · {appointment.durationMinutes} min
        </span>
      </span>

      <StatusBadge tone={appointment.statusTone}>
        {appointment.statusLabel}
      </StatusBadge>
    </li>
  )
}
