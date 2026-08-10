import type { Appointment, AppointmentStatus } from '@/modules/_shared/domain/types'

/**
 * O dia de um profissional, derivado dos atendimentos dele.
 *
 * # O que este módulo NÃO é
 *
 * Não é um domínio novo com persistência própria. O portal não tem tabela: ele
 * é uma **leitura** sobre `appointments` e `clinic_tasks`, montada para
 * responder uma pergunta que nenhuma outra tela responde — "o que eu tenho
 * pela frente agora".
 *
 * `/agenda` mostra a clínica inteira e serve à recepção, que precisa ver todos
 * os profissionais para encaixar. Quem atende não precisa disso e paga caro por
 * ele: abre a agenda da clínica, procura o próprio nome numa grade com cinco
 * colunas, e faz isso entre um paciente e outro.
 *
 * # Por que a derivação mora no domain
 *
 * Porque "qual é o atendimento de agora" é uma regra, não formatação. Ela tem
 * casos de borda que só aparecem escritos — atendimento que já devia ter
 * acabado e não foi encerrado, cancelado que precisa continuar visível — e cada
 * um deles é uma decisão sobre o que a pessoa vê quando levanta os olhos do
 * paciente. Espalhada pela tela, viraria `filter` sem nome e sem teste.
 */

/** Estados em que o atendimento ainda vai acontecer, ou está acontecendo. */
const LIVE_STATUSES: readonly AppointmentStatus[] = [
  'scheduled',
  'confirmed',
  'checked_in',
  'in_progress',
]

/**
 * Estados que ENCERRAM o atendimento — cada um por um motivo diferente.
 *
 * `canceled` e `no_show` entram junto com `completed` de propósito: os três
 * significam "não tenho mais nada a fazer aqui hoje". A distinção entre eles
 * importa para o faturamento e para a recepção, não para quem está atendendo —
 * e continua visível no rótulo de cada linha.
 */
const CLOSED_STATUSES: readonly AppointmentStatus[] = [
  'completed',
  'canceled',
  'no_show',
]

/**
 * Os quatro grupos são uma PARTIÇÃO: todo atendimento cai em exatamente um.
 *
 * Isso não é elegância — é o que impede a tela de perder linha. A primeira
 * versão desta função tinha só `current`, `upcoming` e `finished`, e um
 * atendimento que começou às 8h e ninguém encerrou não era nenhum dos três: ele
 * simplesmente sumia. Sumir é o pior desfecho possível aqui, porque a ausência
 * se parece com "não havia nada marcado".
 */
export interface ProfessionalDay {
  /**
   * O que está acontecendo agora — a janela [início, fim) contém o instante.
   *
   * No máximo um. Havendo sobreposição (que a agenda recusa criar, mas o banco
   * pode ter de antes), vence o que começou por último: é o que tem alguém na
   * sala.
   */
  current: Appointment | null
  /**
   * Já começou, continua aberto, e não é o que está na sua frente.
   *
   * É o grupo que existe para ser incômodo. Consulta que estoura o horário é
   * rotina; o que não é rotina é ela continuar aberta no fim do dia, e nesse
   * estado ela não entra no faturamento nem libera a sala. A tela mostra
   * justamente para que alguém feche.
   *
   * A definição é "começou e não é `current`", e não "passou do horário",
   * porque a segunda deixaria de fora o atendimento sobreposto ainda em curso.
   * Sobreposição a agenda recusa criar desde `20260808_appointments_no_overlap`,
   * mas linha anterior a essa data existe — e sumir é pior que aparecer no
   * grupo com o nome levemente largo.
   */
  unclosed: Appointment[]
  /** Ainda por vir hoje, do mais próximo ao mais distante. */
  upcoming: Appointment[]
  /** Já encerrados — concluído, cancelado ou falta. */
  finished: Appointment[]
}

function endsAt(appointment: Appointment): number {
  return appointment.startsAt.getTime() + appointment.durationMinutes * 60_000
}

/**
 * Separa o dia do profissional nos quatro grupos.
 *
 * `now` é parâmetro, e não `new Date()` aqui dentro: função que lê o relógio
 * não tem como ser testada em nenhum caso de borda, e todos os casos de borda
 * desta função são sobre o relógio.
 */
export function splitDay(
  appointments: readonly Appointment[],
  now: Date,
): ProfessionalDay {
  const ordered = [...appointments].sort(
    (a, b) => a.startsAt.getTime() - b.startsAt.getTime(),
  )

  const finished = ordered.filter((item) =>
    CLOSED_STATUSES.includes(item.status),
  )
  const live = ordered.filter((item) => LIVE_STATUSES.includes(item.status))

  const instant = now.getTime()
  const running = live.filter(
    (item) => item.startsAt.getTime() <= instant && endsAt(item) > instant,
  )

  // Último a começar entre os que estão correndo. Ver o JSDoc de `current`.
  const current = running.length > 0 ? running[running.length - 1] : null

  /*
   * A partição fecha: todo `live` tem `startsAt <= now` ou `startsAt > now`, e
   * o primeiro caso é `current` ou `unclosed`. Nada cai fora dos três.
   */
  return {
    current,
    unclosed: live.filter(
      (item) => item !== current && item.startsAt.getTime() <= instant,
    ),
    upcoming: live.filter((item) => item.startsAt.getTime() > instant),
    finished,
  }
}

/**
 * Tarefa como o portal precisa dela — e nada além.
 *
 * Tipo PRÓPRIO, e não `Task` do módulo de tarefas: a regra 4 proíbe um módulo
 * de alcançar o interior de outro, e o portal não precisa de `source`,
 * `appointmentId`, `invoiceId` nem do responsável (é sempre quem está olhando).
 * Copiar o tipo inteiro traria campos que a tela nunca usa e amarraria as duas
 * telas a cada mudança de um lado só.
 */
export interface PortalTask {
  id: string
  title: string
  dueAt: Date | null
  /** Menor número primeiro, como em `clinic_tasks.priority`. */
  priority: number
  /** Nome do paciente quando a tarefa é sobre alguém. */
  patientName: string | null
}

export interface ProfessionalSummary {
  /** Atendimentos do dia que ainda vão acontecer ou estão acontecendo. */
  remaining: number
  /** Já encerrados hoje, em qualquer dos três desfechos. */
  finished: number
  /** Tarefas abertas atribuídas a esta pessoa. */
  openTasks: number
  /** Tarefas com prazo já vencido — o que gera ligação hoje. */
  overdueTasks: number
}

export function summarize(
  day: ProfessionalDay,
  tasks: readonly PortalTask[],
  now: Date,
): ProfessionalSummary {
  return {
    /*
     * `unclosed` conta como restante: são atendimentos que ainda pedem uma
     * ação desta pessoa — encerrar. Deixá-los fora faria o cartão dizer "nada
     * pela frente" com três consultas abertas na tela logo abaixo.
     */
    remaining:
      (day.current ? 1 : 0) + day.upcoming.length + day.unclosed.length,
    finished: day.finished.length,
    openTasks: tasks.length,
    overdueTasks: tasks.filter(
      (task) => task.dueAt !== null && task.dueAt.getTime() < now.getTime(),
    ).length,
  }
}

/** Tarefa vencida — separada para a tela não repetir a comparação de data. */
export function isOverdue(task: PortalTask, now: Date): boolean {
  return task.dueAt !== null && task.dueAt.getTime() < now.getTime()
}
