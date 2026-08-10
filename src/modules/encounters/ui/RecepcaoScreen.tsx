import { Clock3, PhoneCall, UserCheck } from 'lucide-react'
import Link from 'next/link'

import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { StatCard } from '@/components/ui/stat-card'

export interface ReceptionSlotDto {
  id: string
  patientName: string
  professionalName: string
  /** Hora já formatada no servidor — a tela não reconstrói data. */
  time: string
  lateMinutes: number
}

export interface RecepcaoScreenProps {
  late: readonly ReceptionSlotDto[]
  expected: readonly ReceptionSlotDto[]
  arrivedCount: number
  waitingCount: number
  isLive: boolean
}

/**
 * Recepção — a pergunta que nenhuma tela respondia.
 *
 * `/agenda` mostra quem tem hora marcada. `/atendimentos` mostra quem está na
 * fila. **Quem deveria ter chegado às 14h e não apareceu?** era uma conta que a
 * recepção fazia de cabeça, comparando duas telas — e é a conta que faz alguém
 * pegar o telefone antes de o horário virar falta.
 *
 * Por isso esta tela não repete a fila: ela mostra o que falta, e manda para
 * `/atendimentos` quem já está aqui. Duas telas com a mesma lista é como elas
 * passam a discordar.
 */
export function RecepcaoScreen({
  late,
  expected,
  arrivedCount,
  waitingCount,
  isLive,
}: RecepcaoScreenProps) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Hoje"
        title="Recepção"
        description="Quem falta chegar, quem está atrasado e quem já está na clínica."
        actions={
          <Button asChild variant="secondary">
            <Link href="/atendimentos">Abrir a fila</Link>
          </Button>
        }
      />

      {!isLive ? (
        <p
          role="status"
          className="rounded-card border border-attention/30 bg-attention-surface px-4 py-3 text-aux text-foreground"
        >
          Demonstração local: agenda e fila são dados de exemplo.
        </p>
      ) : null}

      <section aria-label="Resumo da recepção">
        <div className="grid grid-cols-2 gap-4 nav:grid-cols-4">
          <StatCard
            label="Atrasados"
            value={String(late.length).padStart(2, '0')}
            icon={PhoneCall}
            tone={late.length > 0 ? 'attention' : undefined}
          />
          <StatCard
            label="Ainda esperados"
            value={String(expected.length).padStart(2, '0')}
            icon={Clock3}
          />
          <StatCard
            label="Já deram entrada"
            value={String(arrivedCount).padStart(2, '0')}
            icon={UserCheck}
          />
          <StatCard
            label="Aguardando atendimento"
            value={String(waitingCount).padStart(2, '0')}
            icon={Clock3}
          />
        </div>
      </section>

      <SlotList
        title="Atrasados"
        description="Passou do horário e não deram entrada. A lista começa por quem espera há mais tempo."
        slots={late}
        emptyTitle="Ninguém atrasado"
        emptyDescription="Todo mundo com hora marcada até agora já chegou."
        showLate
      />

      <SlotList
        title="Ainda esperados hoje"
        description="Horário marcado que ainda não chegou."
        slots={expected}
        emptyTitle="Nada mais marcado para hoje"
        emptyDescription="Não há horários pendentes de chegada."
      />
    </div>
  )
}

function SlotList({
  title,
  description,
  slots,
  emptyTitle,
  emptyDescription,
  showLate = false,
}: {
  title: string
  description: string
  slots: readonly ReceptionSlotDto[]
  emptyTitle: string
  emptyDescription: string
  showLate?: boolean
}) {
  return (
    <Card className="flex flex-col gap-4 p-6">
      <div>
        <h2 className="text-h3 font-semibold text-foreground">{title}</h2>
        <p className="text-aux text-muted">{description}</p>
      </div>

      {slots.length === 0 ? (
        <EmptyState
          icon={UserCheck}
          title={emptyTitle}
          description={emptyDescription}
        />
      ) : (
        <ul className="flex flex-col divide-y divide-border-card">
          {slots.map((slot) => (
            <li
              key={slot.id}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-3"
            >
              <div className="flex items-baseline gap-3">
                <span className="text-control font-semibold text-foreground tabular-nums">
                  {slot.time}
                </span>
                <span className="text-control text-foreground">
                  {slot.patientName}
                </span>
              </div>

              <div className="flex items-baseline gap-3">
                <span className="text-aux text-muted">
                  {slot.professionalName}
                </span>
                {showLate ? (
                  <span className="text-label font-semibold text-danger">
                    {formatLate(slot.lateMinutes)}
                  </span>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/** "18 min" até uma hora; depois "1h20", que é como a recepção fala. */
function formatLate(minutes: number): string {
  if (minutes < 60) return `${minutes} min`

  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60

  return rest === 0 ? `${hours}h` : `${hours}h${String(rest).padStart(2, '0')}`
}
