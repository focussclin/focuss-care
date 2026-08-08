import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { CalendarCheck, Clock3, Plus, TrendingUp, UserPlus } from 'lucide-react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { displayNameOf, getSessionState } from '@/lib/auth/session'
import { getActiveClinicRole } from '@/lib/auth/active-clinic'
import { can } from '@/lib/auth/permissions'
import { currentUser } from '@/lib/mocks/clinic-data'
import { addDays, formatEyebrowDate, getGreeting, startOfDay } from '@/lib/utils/date'
import { getBillingRepository } from '@/modules/billing/infrastructure/repository'
import { getReportingRepository } from '@/modules/reporting/infrastructure/repository'
import { getAppointmentRepository } from '@/modules/scheduling/infrastructure/repository'
import { buildFinancialPulse } from '@/modules/dashboard/application/financialPulse'
import { FinancialPulseCard } from '@/modules/dashboard/ui/FinancialPulseCard'
import { NotificationBell } from '@/modules/dashboard/ui/NotificationBell'
import { QuickActionsCard } from '@/modules/dashboard/ui/QuickActionsCard'
import { RecentActivityCard } from '@/modules/dashboard/ui/RecentActivityCard'
import { StatCard } from '@/components/ui/stat-card'
import { TodayAgendaCard } from '@/modules/dashboard/ui/TodayAgendaCard'

export const metadata: Metadata = {
  title: 'Visão geral',
  description: 'Resumo do dia da sua clínica no Focuss Care.',
}

/** Variacao percentual com sinal, no formato que o `StatCard` exibe. */
function formatTrend(current: number, previous: number): string {
  const delta = Math.round(((current - previous) / previous) * 100)
  return `${delta >= 0 ? '+' : ''}${delta}%`
}

export default async function DashboardPage() {
  /*
   * connection() impede que a pagina seja pre-renderizada no build: sem ela, a
   * saudacao, o eyebrow e os tempos relativos congelariam no momento da compilacao.
   * A data vem do servidor para que HTML inicial e hidratacao coincidam.
   */
  await connection()
  const now = new Date()
  const today = startOfDay(now)

  const [appointmentSource, reportingSource] = await Promise.all([
    getAppointmentRepository(today),
    getReportingRepository(),
  ])

  const role = await getActiveClinicRole()
  const billingSource = can(role, 'invoice.read')
    ? await getBillingRepository()
    : null

  /*
   * Composicao entre modulos acontece na ROTA (regra 4): `reporting` conta, e
   * `scheduling` entrega a agenda do dia. Nenhum dos dois alcanca o interior do
   * outro.
   */
  const [todayAppointments, snapshot, activity] = await Promise.all([
    appointmentSource.repository.listByRange(
      appointmentSource.clinicId,
      today,
      addDays(today, 1),
    ),
    reportingSource.repository.dailySnapshot(reportingSource.clinicId, now),
    reportingSource.repository.recentActivity(reportingSource.clinicId, 5),
  ])

  const financialPulse = billingSource
    ? buildFinancialPulse(
        await billingSource.repository.listPayables(
          billingSource.clinicId,
          new Date(today.getFullYear() + 1, today.getMonth(), today.getDate()),
        ),
        today,
      )
    : null

  /*
   * Variacao de novos pacientes — mes corrente contra o anterior.
   *
   * E a UNICA variacao exibida no painel, e tem base declarada. Os outros cards
   * ficam sem: "+12%" sem dizer em relacao a que e decoracao, e num painel de
   * gestao decoracao vira decisao.
   *
   * Mes anterior em zero devolve null em vez de "+100%": crescer do nada nao e
   * percentual, e o primeiro mes de qualquer clinica cairia nesse caso.
   */
  const newPatientsTrend =
    snapshot.newPatientsPreviousMonth > 0
      ? formatTrend(
          snapshot.newPatientsThisMonth,
          snapshot.newPatientsPreviousMonth,
        )
      : undefined

  /*
   * A saudacao e o avatar sao identidade, nao metrica: saem da sessao. O nome de
   * demonstracao so aparece quando NAO HA usuario — ou seja, quando o Supabase
   * nao esta configurado e a aplicacao inteira e demonstracao local.
   */
  const session = await getSessionState()
  const displayName = displayNameOf(session, currentUser.name)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={formatEyebrowDate(now)}
        title={`${getGreeting(now)}, ${displayName.split(' ')[0]}`}
        description="Aqui está o resumo da sua clínica hoje."
        actions={
          <>
            <NotificationBell />

            <span className="inline-flex size-11 items-center justify-center">
              <Avatar name={displayName} size="md" />
              <span className="sr-only">{displayName}</span>
            </span>

            <Button asChild className="max-md:flex-1">
              <Link href="/agenda?novo=1">
                <Plus aria-hidden className="size-4" strokeWidth={2.25} />
                Novo atendimento
              </Link>
            </Button>
          </>
        }
      />

      {/* Resumo do dia — duas colunas no mobile, quatro a partir de 1100px */}
      <section aria-label="Resumo do dia">
        <div className="grid grid-cols-2 gap-4 nav:grid-cols-4">
          <StatCard
            label="Atendimentos hoje"
            value={String(snapshot.appointmentsToday)}
            icon={CalendarCheck}
          />
          <StatCard
            label="Pacientes aguardando"
            value={String(snapshot.waitingNow).padStart(2, '0')}
            icon={Clock3}
            tone="attention"
          />
          <StatCard
            label="Novos pacientes no mês"
            value={String(snapshot.newPatientsThisMonth).padStart(2, '0')}
            trend={newPatientsTrend}
            icon={UserPlus}
          />
          {/*
            Sem base, o card diz "—" e não "0%".
            Zero por cento significaria que ninguém compareceu; numa clínica que
            ainda não fechou nenhum atendimento, isso é uma acusação falsa.
          */}
          <StatCard
            label="Comparecimento (30 dias)"
            value={
              snapshot.attendance ? `${snapshot.attendance.percentage}%` : '—'
            }
            icon={TrendingUp}
          />
        </div>
      </section>

      <section aria-label="Ações rápidas">
        <QuickActionsCard />
      </section>

      {financialPulse ? <FinancialPulseCard pulse={financialPulse} /> : null}

      {/* Conteudo principal — 60% / 40% a partir de 1100px */}
      <section aria-label="Detalhes do dia">
        <div className="grid gap-6 nav:grid-cols-[3fr_2fr]">
          <TodayAgendaCard appointments={todayAppointments} dateLabel="Hoje" />
          <RecentActivityCard entries={activity} now={now} />
        </div>
      </section>
    </div>
  )
}
