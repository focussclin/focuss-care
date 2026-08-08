import {
  AlertTriangle,
  CalendarCheck,
  Info,
  TrendingUp,
  UserRound,
  UsersRound,
} from 'lucide-react'
import Link from 'next/link'

import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { StatCard } from '@/components/ui/stat-card'
import { cn } from '@/lib/utils/cn'
import { formatShortDate } from '@/lib/utils/date'

import type { PeriodReport } from '../domain/ClinicMetrics'
import { periodOptions, type ResolvedPeriod } from '../schemas/report.schema'

export interface RelatoriosScreenProps {
  report: PeriodReport
  period: ResolvedPeriod
  isLive?: boolean
}

/**
 * Relatórios — feature **T-01**.
 *
 * Substitui a tela de vitrine que vivia em `OperationsScreens.tsx`, onde quatro
 * cartões traziam "124 atendimentos", "R$ 12,1k" e "+12% vs. período anterior"
 * escritos no arquivo.
 *
 * # Componente de servidor, sem estado
 *
 * A troca de período é um LINK, não um `useState`: o relatório inteiro vem do
 * banco, então mudar o período é buscar outro relatório. Fazer isso no cliente
 * exigiria uma action de leitura e um estado de carregamento para reproduzir o
 * que a URL já faz — e a URL ainda pode ser compartilhada e recarregada.
 *
 * # O financeiro não está aqui, e isso é uma afirmação
 *
 * `invoices` e `payments` existem no schema, e nenhuma tela do produto grava
 * neles. Ler agora devolveria R$ 0,00 para toda clínica: verdadeiro como
 * consulta, falso como informação. O rodapé diz o que falta.
 */
export function RelatoriosScreen({
  report,
  period,
  isLive = false,
}: RelatoriosScreenProps) {
  const { appointments, attendance } = report

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Gestão da clínica"
        title="Relatórios"
        description="O que aconteceu na clínica, contado a partir dos registros."
      />

      <nav aria-label="Período do relatório" className="flex flex-wrap gap-2">
        {periodOptions.map((option) => {
          const active = option.value === period.key

          return (
            <Link
              key={option.value}
              href={`/relatorios?periodo=${option.value}`}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-field border px-3.5 py-2 text-aux font-semibold transition-colors',
                active
                  ? 'border-brand bg-brand-subtle text-link'
                  : 'border-border-default bg-surface text-muted hover:border-border-hover hover:text-foreground',
              )}
            >
              {option.label}
            </Link>
          )
        })}
      </nav>

      <p className="text-label text-muted">
        {/* O fim é exclusivo no cálculo; a tela mostra o último dia INCLUÍDO,
            que é o que a pessoa espera ler. */}
        Período: {formatShortDate(report.from)} a{' '}
        {formatShortDate(new Date(report.to.getTime() - 86_400_000))}
      </p>

      {isLive ? null : (
        <p
          role="status"
          className="rounded-card border border-border-card bg-surface px-4 py-3 text-aux text-muted"
        >
          Modo demonstração: os números abaixo são contados a partir dos dados de
          exemplo, e não de uma clínica real.
        </p>
      )}

      {report.truncated ? (
        <p
          role="alert"
          className="flex items-start gap-2.5 rounded-card border border-attention/30 bg-attention-surface px-4 py-3 text-aux text-foreground"
        >
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
          Este período tem mais atendimentos do que o relatório consegue somar de
          uma vez. Os números abaixo descrevem parte do período — escolha um
          intervalo menor para ver o total.
        </p>
      ) : null}

      <section aria-label="Resumo do período">
        <div className="grid grid-cols-2 gap-4 nav:grid-cols-4">
          <StatCard
            label="Atendimentos no período"
            value={String(appointments.total)}
            icon={CalendarCheck}
          />
          <StatCard
            label="Realizados"
            value={String(appointments.completed)}
            icon={TrendingUp}
          />
          <StatCard
            label="Novos pacientes"
            value={String(report.newPatients)}
            icon={UserRound}
          />
          <StatCard
            label="Pacientes ativos"
            value={String(report.activePatients)}
            icon={UsersRound}
          />
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader
            title="Como os atendimentos terminaram"
            description="Cada agendamento do período em um desfecho só."
          />

          <dl className="divide-y divide-border-card border-t border-border-card">
            <Outcome label="Realizados" value={appointments.completed} />
            <Outcome
              label="Ainda por acontecer"
              value={appointments.upcoming}
              hint="Agendados, confirmados ou em andamento."
            />
            <Outcome label="Cancelados" value={appointments.canceled} />
            <Outcome
              label="Faltas"
              value={appointments.noShow}
              hint="Paciente não compareceu e ninguém avisou."
            />
          </dl>

          <div className="border-t border-border-card px-5 py-4">
            {attendance ? (
              <>
                <p className="text-label text-muted">Taxa de comparecimento</p>
                <p className="mt-1 text-metric font-semibold text-foreground">
                  {attendance.percentage}%
                </p>
                <p className="mt-1 text-label text-muted">
                  {attendance.completed} realizados para {attendance.noShow}{' '}
                  {attendance.noShow === 1 ? 'falta' : 'faltas'}.
                </p>
              </>
            ) : (
              /*
                Ausência de base NÃO é 0%.
                Zero por cento diria que ninguém compareceu — acusação séria
                para uma clínica que apenas ainda não fechou um atendimento.
              */
              <p className="text-aux text-muted">
                A taxa de comparecimento aparece quando houver atendimento
                concluído ou falta registrada neste período.
              </p>
            )}
          </div>
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title="Por profissional"
            description="Atendimentos não cancelados no período."
          />

          {report.byProfessional.length === 0 ? (
            <EmptyState
              icon={UsersRound}
              title="Nenhum atendimento neste período."
            />
          ) : (
            <ul className="divide-y divide-border-card border-t border-border-card">
              {report.byProfessional.map((entry) => (
                <li
                  key={entry.professionalId}
                  className="flex items-center justify-between gap-4 px-5 py-3.5"
                >
                  <span className="min-w-0 truncate text-aux text-foreground">
                    {entry.name}
                  </span>
                  <span className="text-aux font-semibold text-foreground">
                    {entry.total}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <p className="flex items-start gap-2.5 text-label text-muted">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        Faturamento, recebimentos e glosas de convênio ainda não aparecem aqui —
        não por falta do relatório, mas porque nenhuma tela do sistema registra
        essas informações ainda. Mostrar R$ 0,00 diria que a clínica não faturou,
        e não é isso que está acontecendo.
      </p>
    </div>
  )
}

function Outcome({
  label,
  value,
  hint,
}: {
  label: string
  value: number
  hint?: string
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-5 py-3.5">
      <div className="min-w-0">
        <dt className="text-aux text-foreground">{label}</dt>
        {hint ? <p className="mt-0.5 text-label text-muted">{hint}</p> : null}
      </div>
      <dd className="text-aux font-semibold text-foreground">{value}</dd>
    </div>
  )
}
