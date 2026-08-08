import type { Metadata } from 'next'
import Link from 'next/link'
import { connection } from 'next/server'
import { CalendarCheck, Clock3, Plus, TrendingUp, UserPlus } from 'lucide-react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Avatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { getSessionState } from '@/lib/auth/session'
import {
  currentUser,
  dashboardMetrics,
  getRecentActivity,
} from '@/lib/mocks/clinic-data'
import { addDays, formatEyebrowDate, getGreeting, startOfDay } from '@/lib/utils/date'
import { getAppointmentRepository } from '@/modules/scheduling/infrastructure/repository'
import { NotificationBell } from '@/modules/dashboard/ui/NotificationBell'
import { QuickActionsCard } from '@/modules/dashboard/ui/QuickActionsCard'
import { RecentActivityCard } from '@/modules/dashboard/ui/RecentActivityCard'
import { StatCard } from '@/components/ui/stat-card'
import { TodayAgendaCard } from '@/modules/dashboard/ui/TodayAgendaCard'

export const metadata: Metadata = {
  title: 'Visão geral',
  description: 'Resumo do dia da sua clínica no Focuss Care.',
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

  const { repository, clinicId } = await getAppointmentRepository(today)
  const todayAppointments = await repository.listByRange(
    clinicId,
    today,
    addDays(today, 1),
  )

  const activity = getRecentActivity(now)

  /*
   * A saudacao e o avatar sao identidade, nao metrica: saem da sessao. O nome do
   * mock so aparece quando o Supabase nao esta configurado — ai a aplicacao
   * inteira e demonstracao local. As metricas abaixo continuam mockadas ate T-01.
   */
  const session = await getSessionState()
  const displayName =
    session.status === 'active' ? session.user.displayName : currentUser.name

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={formatEyebrowDate(now)}
        title={`${getGreeting(now)}, ${displayName.split(' ')[0]}`}
        description="Aqui está o resumo da sua clínica hoje."
        actions={
          <>
            <NotificationBell count={dashboardMetrics.waitingPatients} />

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
            value={String(dashboardMetrics.appointmentsToday)}
            trend={dashboardMetrics.appointmentsTrend}
            icon={CalendarCheck}
          />
          <StatCard
            label="Pacientes aguardando"
            value={String(dashboardMetrics.waitingPatients).padStart(2, '0')}
            icon={Clock3}
            tone="attention"
          />
          <StatCard
            label="Novos pacientes"
            value={String(dashboardMetrics.newPatients).padStart(2, '0')}
            trend={dashboardMetrics.newPatientsTrend}
            icon={UserPlus}
          />
          <StatCard
            label="Taxa de comparecimento"
            value={`${dashboardMetrics.attendanceRate}%`}
            icon={TrendingUp}
          />
        </div>
      </section>

      <section aria-label="Ações rápidas">
        <QuickActionsCard />
      </section>

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
