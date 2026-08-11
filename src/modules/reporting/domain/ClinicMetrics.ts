/**
 * Indicadores da clínica — feature **T-01**.
 *
 * # A regra que decide o que existe aqui
 *
 * Um indicador só entra se houver **linha no banco que o sustente**. Não há
 * número derivado de estimativa, de média de mercado nem de tabela que o produto
 * ainda não preenche. Um painel de gestão é lido para decidir — contratar,
 * demitir, mudar horário — e número inventado ali custa mais caro que número
 * ausente.
 *
 * O que ainda não tem fonte aparece na tela como indisponível, com o motivo. Ver
 * `ReportingRepository`.
 */

import type { QueueTimes } from './QueueDurations'

/**
 * Comparecimento em um período.
 *
 * Fica `null` quando não há nenhum atendimento passado com desfecho registrado.
 * Isso é diferente de 0%: **zero por cento significa que ninguém compareceu**, e
 * exibi-lo numa clínica que simplesmente ainda não fechou nenhum atendimento
 * seria acusar a operação de um problema que não existe.
 */
export interface AttendanceRate {
  /** Atendimentos com desfecho `completed`. */
  completed: number
  /** Faltas registradas (`no_show`). */
  noShow: number
  /** `completed / (completed + noShow)` em 0–100, já arredondado. */
  percentage: number
}

/**
 * O resumo do dia, no topo do painel.
 *
 * Cada campo abaixo tem uma fonte declarada, e a fatia que a criou entre
 * parênteses — se a fatia não existisse, o número não estaria aqui.
 */
export interface DailySnapshot {
  /** `appointments` do dia, exceto cancelados (A-01). */
  appointmentsToday: number
  /** `waiting_queue` com status `waiting`, chegados hoje (E-01). */
  waitingNow: number
  /** `patients` criados no mês corrente (P-01). */
  newPatientsThisMonth: number
  /**
   * Mesma contagem no mês anterior, para a variação.
   *
   * Existe para que a variação exibida tenha uma base declarada. "+12%" sem
   * dizer em relação a quê é decoração.
   */
  newPatientsPreviousMonth: number
  /** Comparecimento dos últimos 30 dias, ou `null`. */
  attendance: AttendanceRate | null
}

/** Contagem de atendimentos por desfecho, em um período. */
export interface AppointmentTotals {
  total: number
  /** Ainda por acontecer: `scheduled`, `confirmed`, `checked_in`, `in_progress`. */
  upcoming: number
  completed: number
  canceled: number
  noShow: number
}

/** Volume por profissional — quem está sustentando a agenda. */
export interface ProfessionalWorkload {
  professionalId: string
  name: string
  /** Atendimentos não cancelados no período. */
  total: number
}

export interface PeriodReport {
  from: Date
  /** Exclusivo: o período é `[from, to)`. */
  to: Date
  appointments: AppointmentTotals
  /** `patients` criados dentro do período. */
  newPatients: number
  /** Base ativa hoje — não é do período, e a tela diz isso. */
  activePatients: number
  attendance: AttendanceRate | null
  byProfessional: readonly ProfessionalWorkload[]
  /**
   * Tempos da fila de espera no período — feature **T-02**.
   *
   * Vem do mesmo relatório, e não de uma tela própria, porque responde a mesma
   * pergunta das outras linhas: como o período correu. `waiting_queue` guarda os
   * carimbos desde E-01 e nada os lia.
   */
  queueTimes: QueueTimes
  /**
   * O período tem mais atendimentos do que o relatório conseguiu ler.
   *
   * A leitura tem teto (ver `PERIOD_ROW_CAP` no adapter). Quando ele é atingido,
   * os números abaixo descrevem uma AMOSTRA, e a tela precisa dizer isso —
   * relatório truncado em silêncio é a pior forma de erro num painel de gestão,
   * porque o número parece completo e a decisão é tomada em cima dele.
   */
  truncated: boolean
}

/**
 * Um mês da série histórica.
 *
 * `month` é o PRIMEIRO instante do mês, na zona local — a mesma âncora que o
 * adapter usa para montar a janela `[mês, mês+1)`. Guardar o mês como `Date`, e
 * não como `"2026-08"`, evita que a tela precise reconstruir a data para
 * formatar o rótulo em pt-BR.
 */
export interface MonthlyPoint {
  month: Date
  /** Atendimentos com hora marcada no mês, exceto cancelados. */
  appointments: number
  /** Quantos daqueles efetivamente aconteceram. */
  completed: number
  /** Pacientes cadastrados no mês. */
  newPatients: number
}

/**
 * A série que a tela de indicadores desenha.
 *
 * Existe separada de `PeriodReport` porque responde outra pergunta. Aquele é uma
 * FOTOGRAFIA de um intervalo: quantos atendimentos, quantas faltas, quem
 * atendeu. Este é a EVOLUÇÃO: a clínica está crescendo ou encolhendo, e desde
 * quando. Um número isolado não responde isso, e foi por isso que a tela de
 * relatórios nunca conseguiu servir de painel de gestão.
 */
export interface MonthlyTrend {
  /** Do mês mais antigo para o mais recente — a ordem em que o gráfico lê. */
  points: readonly MonthlyPoint[]
}
