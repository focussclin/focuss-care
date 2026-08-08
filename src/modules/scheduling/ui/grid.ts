import type { StatusTone } from '@/components/ui/status-badge'
import { minutesFromMidnight } from '@/lib/utils/date'
import type { Appointment } from '@/modules/_shared/domain/types'

/** Grade horaria definida em AGENDA_DESIGN.md: 07:00 as 19:00, intervalos de 30 min. */
export const DAY_START_HOUR = 7
export const DAY_END_HOUR = 19
export const SLOT_MINUTES = 30
/** Altura de cada intervalo de 30 minutos, em pixels. */
export const SLOT_HEIGHT = 40

export const TOTAL_SLOTS =
  ((DAY_END_HOUR - DAY_START_HOUR) * 60) / SLOT_MINUTES

export const GRID_HEIGHT = TOTAL_SLOTS * SLOT_HEIGHT

/** Rotulos da coluna de horarios ("07:00", "07:30", ...). */
export function getTimeLabels(): string[] {
  return Array.from({ length: TOTAL_SLOTS }, (_, index) => {
    const totalMinutes = DAY_START_HOUR * 60 + index * SLOT_MINUTES
    const hours = String(Math.floor(totalMinutes / 60)).padStart(2, '0')
    const minutes = String(totalMinutes % 60).padStart(2, '0')
    return `${hours}:${minutes}`
  })
}

/** Posicao e altura de um compromisso dentro da grade, em pixels. */
export function getBlockGeometry(appointment: Appointment): {
  top: number
  height: number
} {
  const startMinutes = minutesFromMidnight(appointment.startsAt)
  const offsetMinutes = startMinutes - DAY_START_HOUR * 60

  return {
    top: (offsetMinutes / SLOT_MINUTES) * SLOT_HEIGHT,
    // 2px de folga para os blocos nao encostarem uns nos outros
    height: Math.max(
      (appointment.durationMinutes / SLOT_MINUTES) * SLOT_HEIGHT - 2,
      SLOT_HEIGHT - 2,
    ),
  }
}

/**
 * Aparencia do bloco por status. Fundo e texto vem dos tokens de status; a borda
 * lateral de 3px e exigida pelo handoff.
 */
export const blockClassesByTone: Record<StatusTone, string> = {
  positive:
    'bg-status-positive-surface text-status-positive border-l-status-positive',
  pending:
    'bg-status-pending-surface text-status-pending border-l-status-pending',
  neutral:
    'bg-status-neutral-surface text-status-neutral border-l-status-neutral',
  negative:
    'bg-status-negative-surface text-status-negative border-l-status-negative',
}
