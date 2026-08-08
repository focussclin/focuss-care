/**
 * Formatacao de datas em pt-BR sem dependencia externa.
 * Intl ja resolve mes/dia da semana com a grafia correta; uma lib de datas aqui
 * seria peso de bundle sem ganho.
 */

const LOCALE = 'pt-BR'

export const WEEKDAY_LABELS = [
  'Seg',
  'Ter',
  'Qua',
  'Qui',
  'Sex',
  'Sáb',
  'Dom',
] as const

/** "SEXTA-FEIRA, 07 DE AGOSTO" — eyebrow do dashboard. */
export function formatEyebrowDate(date: Date): string {
  const weekday = date.toLocaleDateString(LOCALE, { weekday: 'long' })
  const day = String(date.getDate()).padStart(2, '0')
  const month = date.toLocaleDateString(LOCALE, { month: 'long' })

  return `${weekday}, ${day} de ${month}`.toUpperCase()
}

/** "07 de agosto de 2026" — barra de controle da agenda. */
export function formatFullDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, '0')
  const month = date.toLocaleDateString(LOCALE, { month: 'long' })

  return `${day} de ${month} de ${date.getFullYear()}`
}

/** "sexta-feira, 07 de agosto" — cabecalho da visualizacao diaria. */
export function formatDayHeading(date: Date): string {
  const weekday = date.toLocaleDateString(LOCALE, { weekday: 'long' })
  const day = String(date.getDate()).padStart(2, '0')
  const month = date.toLocaleDateString(LOCALE, { month: 'long' })

  return `${weekday}, ${day} de ${month}`
}

/** "12/03/2026" */
export function formatShortDate(date: Date): string {
  return date.toLocaleDateString(LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** "14:30" */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString(LOCALE, {
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Saudacao do cabecalho conforme a hora local. */
export function getGreeting(date: Date): string {
  const hour = date.getHours()

  if (hour < 12) return 'Bom dia'
  if (hour < 18) return 'Boa tarde'
  return 'Boa noite'
}

/** "há 5 min", "há 2 h", "ontem" — atividade recente. */
export function formatRelativeTime(date: Date, now: Date): string {
  const diffMinutes = Math.round((now.getTime() - date.getTime()) / 60_000)

  if (diffMinutes < 1) return 'agora'
  if (diffMinutes < 60) return `há ${diffMinutes} min`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `há ${diffHours} h`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return 'ontem'
  if (diffDays < 7) return `há ${diffDays} dias`

  return formatShortDate(date)
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

export function startOfDay(date: Date): Date {
  const result = new Date(date)
  result.setHours(0, 0, 0, 0)
  return result
}

/** Semana comecando na segunda-feira, como pede a visualizacao semanal. */
export function startOfWeek(date: Date): Date {
  const result = startOfDay(date)
  const weekday = result.getDay() // 0 = domingo
  const offset = weekday === 0 ? -6 : 1 - weekday

  return addDays(result, offset)
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** Minutos desde a meia-noite — usado para posicionar blocos na grade. */
export function minutesFromMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes()
}
