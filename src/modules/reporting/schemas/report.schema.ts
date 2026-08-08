/**
 * Períodos que a tela de relatórios oferece — feature **T-01**.
 *
 * A lista é fechada, e não um par de datas livre, por dois motivos que puxam na
 * mesma direção: um intervalo aberto deixaria alguém pedir cinco anos de agenda
 * e estourar o teto de leitura do relatório (ver `PERIOD_ROW_CAP`), e período
 * nomeado é o que a clínica realmente compara — "este mês contra o passado".
 *
 * Seletor de datas livre entra quando houver agregação no banco para sustentá-lo.
 */
export const periodOptions = [
  { value: 'mes-atual', label: 'Este mês' },
  { value: 'mes-anterior', label: 'Mês passado' },
  { value: 'ultimos-90-dias', label: 'Últimos 90 dias' },
] as const

export type PeriodKey = (typeof periodOptions)[number]['value']

export const DEFAULT_PERIOD: PeriodKey = 'mes-atual'

/** Aceita o que vier da URL e devolve um período válido. Nunca lança. */
export function parsePeriod(value: unknown): PeriodKey {
  return periodOptions.some((option) => option.value === value)
    ? (value as PeriodKey)
    : DEFAULT_PERIOD
}

export interface ResolvedPeriod {
  key: PeriodKey
  label: string
  from: Date
  /** Exclusivo: o intervalo é `[from, to)`. */
  to: Date
}

/**
 * Converte a chave em um intervalo de datas.
 *
 * `now` entra por parâmetro para que a função seja pura e testável — e para que
 * servidor e teste não dependam do relógio da máquina.
 *
 * O fim é sempre **exclusivo**. Usar `<=` com o último dia deixaria de fora
 * tudo o que acontece depois de 00:00 daquele dia, que é praticamente o dia
 * inteiro — o erro clássico de relatório que "perde" a última data.
 */
export function resolvePeriod(key: PeriodKey, now: Date): ResolvedPeriod {
  const label =
    periodOptions.find((option) => option.value === key)?.label ?? 'Este mês'

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  if (key === 'mes-anterior') {
    return {
      key,
      label,
      from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      to: monthStart,
    }
  }

  if (key === 'ultimos-90-dias') {
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const from = new Date(to)
    from.setDate(from.getDate() - 90)

    return { key, label, from, to }
  }

  // Este mês: até o fim do dia de hoje, e não até o fim do mês — projetar o
  // mês inteiro faria o relatório contar agendamentos futuros como realizados.
  return {
    key,
    label,
    from: monthStart,
    to: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
  }
}
