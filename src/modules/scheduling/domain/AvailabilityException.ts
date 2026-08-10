import type { AvailabilityKind } from '@/lib/supabase/database.types'

/**
 * Exceções de disponibilidade — o que abre e o que fecha a agenda fora da regra.
 *
 * # Duas espécies, e as duas mexem no mesmo lugar
 *
 * `block` fecha uma janela: feriado da clínica, férias de um profissional,
 * manutenção da sala. `extra` abre: plantão de sábado, mutirão à noite.
 *
 * As duas atuam sobre a mesma decisão — se um horário pode ou não receber
 * atendimento — e é por isso que moram na mesma tabela e são avaliadas juntas.
 *
 * # `professionalId` nulo é a clínica inteira
 *
 * Feriado não é ausência de ninguém: é a clínica fechada. A coluna é nullable
 * no banco exatamente para isso, e a diferença muda quem é afetado — um bloqueio
 * de clínica alcança toda a agenda, um de profissional alcança só a dele.
 *
 * # Isto NÃO é `time_off`
 *
 * `time_off`, em `/equipe`, é registro de RH sobre `employees`: quem tirou
 * férias, quem pediu licença, quem aprovou. Estas exceções são sobre
 * `professionals` e sobre a AGENDA. Uma recepcionista de férias não bloqueia
 * horário nenhum; um profissional de férias bloqueia. As duas coisas parecem a
 * mesma de longe e não são, e por isso nenhuma escreve na tabela da outra.
 */

export const AVAILABILITY_KINDS = ['block', 'extra'] as const satisfies readonly AvailabilityKind[]

export interface AvailabilityException {
  id: string
  /** Nulo = a clínica inteira. */
  professionalId: string | null
  professionalName: string | null
  kind: AvailabilityKind
  startsAt: Date
  endsAt: Date
  reason: string | null
  createdAt: Date
}

export interface NewAvailabilityExceptionData {
  professionalId: string | null
  kind: AvailabilityKind
  startsAt: Date
  endsAt: Date
  reason: string | null
}

/** Janela vazia ou invertida nunca alcança nada — bloqueio que não bloqueia. */
export function isValidWindow(startsAt: Date, endsAt: Date): boolean {
  return startsAt.getTime() < endsAt.getTime()
}

/**
 * Sobreposição de janelas, com as bordas ABERTAS.
 *
 * Um bloqueio que termina 12:00 não alcança o atendimento que começa 12:00 —
 * senão a clínica que fecha para o almoço perderia o primeiro horário da tarde.
 * É a mesma convenção da constraint de sobreposição de `appointments`.
 */
export function overlaps(
  left: { startsAt: Date; endsAt: Date },
  right: { startsAt: Date; endsAt: Date },
): boolean {
  return left.startsAt.getTime() < right.endsAt.getTime() &&
    right.startsAt.getTime() < left.endsAt.getTime()
}

/**
 * A exceção alcança este profissional?
 *
 * Exceção da clínica alcança todo mundo. Exceção de um profissional alcança só
 * ele — inclusive quando o atendimento não tem profissional definido, caso em
 * que só as da clínica valem.
 */
export function appliesTo(
  exception: Pick<AvailabilityException, 'professionalId'>,
  professionalId: string | null,
): boolean {
  if (exception.professionalId === null) return true
  return exception.professionalId === professionalId
}

interface Window {
  startsAt: Date
  endsAt: Date
}

/**
 * O bloqueio que impede este horário, se houver.
 *
 * Devolve o primeiro encontrado — a mensagem cita um motivo, não uma lista, e
 * duas razões para o mesmo "não" não ajudam quem está com o telefone na mão.
 */
export function findBlocking(
  exceptions: readonly AvailabilityException[],
  window: Window,
  professionalId: string | null,
): AvailabilityException | null {
  return (
    exceptions.find(
      (exception) =>
        exception.kind === 'block' &&
        appliesTo(exception, professionalId) &&
        overlaps(exception, window),
    ) ?? null
  )
}

/**
 * Há disponibilidade extra cobrindo TODO o horário?
 *
 * Cobertura parcial não serve: um mutirão das 19h às 21h não autoriza um
 * atendimento das 20h às 22h — a última hora continua fora do expediente e sem
 * ninguém previsto para ela.
 */
export function findCovering(
  exceptions: readonly AvailabilityException[],
  window: Window,
  professionalId: string | null,
): AvailabilityException | null {
  return (
    exceptions.find(
      (exception) =>
        exception.kind === 'extra' &&
        appliesTo(exception, professionalId) &&
        exception.startsAt.getTime() <= window.startsAt.getTime() &&
        exception.endsAt.getTime() >= window.endsAt.getTime(),
    ) ?? null
  )
}

/** Mais recentes primeiro — a agenda olha para frente. */
export function sortByStart<T extends { startsAt: Date | string }>(items: readonly T[]): T[] {
  const time = (value: Date | string) =>
    value instanceof Date ? value.getTime() : new Date(value).getTime()
  return [...items].sort((left, right) => time(right.startsAt) - time(left.startsAt))
}

/**
 * A frase que a recepção lê ao esbarrar num bloqueio.
 *
 * Cita QUEM e POR QUÊ quando existe motivo, porque a próxima pergunta de quem
 * está com o telefone na mão é sempre essa. Sem motivo, ao menos diz de quem é
 * o bloqueio — "a clínica está fechada" e "a agenda da Dra. Ana está fechada"
 * levam a saídas diferentes.
 */
export function describeBlock(exception: AvailabilityException): string {
  const alvo = exception.professionalName
    ? `a agenda de ${exception.professionalName}`
    : 'a agenda da clínica'
  const motivo = exception.reason ? ` (${exception.reason})` : ''
  return `Este horário está bloqueado: ${alvo}${motivo}. Remova o bloqueio para marcar assim mesmo.`
}
