import type { Metadata } from 'next'
import { forbidden } from 'next/navigation'
import { connection } from 'next/server'

import { getActiveClinicRole } from '@/lib/auth/active-clinic'
import { can } from '@/lib/auth/permissions'
import { buildReceptionBoard } from '@/lib/clinic/reception-board'
import { addDays, formatTime, startOfDay } from '@/lib/utils/date'
import { getEncounterRepository } from '@/modules/encounters/infrastructure/repository'
import { RecepcaoScreen } from '@/modules/encounters/ui/RecepcaoScreen'
import { getAppointmentRepository } from '@/modules/scheduling/infrastructure/repository'

export const metadata: Metadata = {
  title: 'Recepção',
  description: 'Quem falta chegar, quem está atrasado e quem já está na clínica.',
}

/**
 * Recepção — feature local sobre agenda + fila.
 *
 * **A composição acontece AQUI, na rota** (regra 4): `scheduling` entrega os
 * horários do dia, `encounters` entrega quem já deu entrada, e nenhum dos dois
 * alcança o interior do outro. A derivação em si mora em
 * `lib/clinic/reception-board.ts`, porque precisa dos dois ao mesmo tempo — é o
 * mesmo caminho de `business-hours.ts`.
 *
 * Nenhum método novo de repositório: `listByRange` e `listQueue` já existiam.
 * A tela é uma pergunta nova sobre dados que já estavam lá.
 */
export default async function RecepcaoPage() {
  // O atraso é contado contra "agora": prerenderizar congelaria o relógio.
  await connection()

  const role = await getActiveClinicRole()
  if (!can(role, 'encounter.read')) forbidden()

  const now = new Date()
  const today = startOfDay(now)

  const [appointmentSource, encounterSource] = await Promise.all([
    getAppointmentRepository(today),
    getEncounterRepository(today),
  ])

  const [appointments, queue, metrics] = await Promise.all([
    appointmentSource.repository.listByRange(
      appointmentSource.clinicId,
      today,
      addDays(today, 1),
    ),
    encounterSource.repository.listQueue(encounterSource.clinicId, today),
    encounterSource.repository.countMetrics(encounterSource.clinicId, today),
  ])

  const board = buildReceptionBoard(appointments, queue, now)

  const toDto = (slot: (typeof board.late)[number]) => ({
    id: slot.id,
    patientName: slot.patientName,
    professionalName: slot.professionalName,
    time: formatTime(slot.startsAt),
    lateMinutes: slot.lateMinutes,
  })

  return (
    <RecepcaoScreen
      late={board.late.map(toDto)}
      expected={board.expected.map(toDto)}
      arrivedCount={board.arrivedCount}
      waitingCount={metrics.waiting}
      isLive={encounterSource.isLive}
    />
  )
}
