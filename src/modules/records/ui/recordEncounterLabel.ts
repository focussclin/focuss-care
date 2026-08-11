import { formatShortDate, formatTime } from '@/lib/utils/date'

import type { RecordEncounterDto } from '../schemas/record.schema'

/**
 * Como um atendimento é nomeado dentro do prontuário.
 *
 * Vive fora dos componentes porque o mesmo atendimento aparece em dois lugares
 * com regras iguais — a opção do seletor de vínculo e a linha de contexto do
 * registro salvo. Duas cópias divergiriam, e o dia em que divergissem a tela
 * diria uma data e o formulário, outra.
 */

const statusLabels: Record<RecordEncounterDto['status'], string> = {
  open: 'Em andamento',
  closed: 'Encerrado',
  // O seletor não oferece atendimento cancelado, mas um registro antigo pode
  // apontar para um que foi cancelado depois — e a tela precisa dizer isso.
  canceled: 'Cancelado',
}

export function encounterStatusLabel(
  status: RecordEncounterDto['status'],
): string {
  return statusLabels[status]
}

/** "10/08 às 14:30" — data e hora do INÍCIO, que é o que identifica a consulta. */
export function formatEncounterMoment(encounter: RecordEncounterDto): string {
  const startedAt = new Date(encounter.startedAt)

  return `${formatShortDate(startedAt)} às ${formatTime(startedAt)}`
}

/** Quanto da queixa cabe no rótulo de uma opção antes de virar ruído. */
const COMPLAINT_PREVIEW = 40

/**
 * Rótulo de uma opção do seletor.
 *
 * A queixa entra **truncada** porque é ela que distingue dois atendimentos do
 * mesmo paciente no mesmo dia — sem ela, a escolha seria entre "14:30" e
 * "16:00", e errar é fácil. O texto inteiro fica no bloco abaixo do campo, que
 * não tem o limite de uma linha de `<option>`.
 */
export function describeEncounterOption(encounter: RecordEncounterDto): string {
  const parts = [
    formatEncounterMoment(encounter),
    encounterStatusLabel(encounter.status),
  ]

  if (encounter.professionalName) parts.push(encounter.professionalName)

  if (encounter.chiefComplaint) {
    const complaint = encounter.chiefComplaint.trim()
    parts.push(
      complaint.length > COMPLAINT_PREVIEW
        ? `${complaint.slice(0, COMPLAINT_PREVIEW).trimEnd()}…`
        : complaint,
    )
  }

  return parts.join(' · ')
}
