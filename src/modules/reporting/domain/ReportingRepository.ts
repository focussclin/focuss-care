import type { ActivityEntry } from '@/modules/_shared/domain/types'

import type {
  DailySnapshot,
  MonthlyTrend,
  PeriodReport,
} from './ClinicMetrics'

/**
 * PORTA dos indicadores — feature **T-01**.
 *
 * # Este módulo só LÊ
 *
 * Não há `create`, `update` nem `delete`, e a ausência é estrutural, não uma
 * etapa que falta: relatório que escreve no que mede deixa de ser relatório. Por
 * isso também não existe action nesta fatia — não há mutação a auditar, e o
 * `createAction` não tem o que fazer aqui.
 *
 * # O que NÃO está aqui, e por quê
 *
 * **Faturamento, recebimentos e inadimplência.** As tabelas (`invoices`,
 * `payments`, `cash_entries`) existem no schema, e é justamente por existirem que
 * a ausência precisa estar escrita: **nenhuma tela do produto grava nelas**, e
 * B-01 é a fatia que vai gravar. Ler agora devolveria R$ 0,00 para toda clínica
 * — verdadeiro como consulta e falso como informação, porque "a clínica não
 * faturou nada" e "o sistema ainda não registra faturamento" são coisas
 * diferentes, e o painel diria a primeira.
 *
 * **Glosas e repasses de convênio.** Mesma situação, com V-01 no lugar de B-01.
 *
 * **Origem do paciente, motivo de cancelamento agrupado, tempo médio de espera.**
 * Não há coluna que os sustente hoje. Tempo de espera seria derivável de
 * `waiting_queue` (`arrived_at` → `called_at`), e entra quando houver volume
 * suficiente para a média significar alguma coisa.
 */
export interface ReportingRepository {
  /** O resumo do dia, para o topo do painel. */
  dailySnapshot(clinicId: string, day: Date): Promise<DailySnapshot>

  /**
   * Atividade recente da clínica.
   *
   * Montada a partir das próprias operações — agendamento criado, paciente
   * cadastrado, atendimento encerrado — e **não** de `audit_log`: a policy de
   * `INSERT` daquela tabela recusa o membro autenticado (pendência **P-P6**), de
   * modo que hoje ela está vazia. Um feed lido de lá seria permanentemente vazio
   * sem que ninguém entendesse por quê.
   *
   * **Nenhuma descrição cita o paciente.** "Encerrou o atendimento de Fulano"
   * diria, para qualquer pessoa com acesso ao painel, quem foi atendido e
   * quando — o painel não tem recorte por papel, e essa é uma informação de
   * saúde. O feed diz o que a equipe fez, não com quem.
   */
  recentActivity(clinicId: string, limit: number): Promise<ActivityEntry[]>

  /** Relatório de um período `[from, to)`. */
  periodReport(clinicId: string, from: Date, to: Date): Promise<PeriodReport>

  /**
   * Série mensal terminando no mês de `reference`, inclusive.
   *
   * Responde "a clínica está crescendo?", que nenhum número isolado responde.
   * É contagem pura — `count` com `head`, sem transferir linha —, então doze
   * meses custam doze contagens e nenhum `PERIOD_ROW_CAP`: não há amostra a
   * truncar, e portanto não há relatório truncado em silêncio.
   */
  monthlyTrend(
    clinicId: string,
    reference: Date,
    months: number,
  ): Promise<MonthlyTrend>
}
