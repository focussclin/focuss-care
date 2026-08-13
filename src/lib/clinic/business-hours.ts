import { z } from 'zod'

/**
 * O horário de funcionamento da clínica — contrato compartilhado.
 *
 * # Por que isto mora em `lib/`, e não no módulo `settings`
 *
 * Dois módulos precisam da MESMA informação por motivos diferentes: `settings`
 * edita o horário (C-01) e `scheduling` o verifica antes de marcar (A-02). A
 * regra 4 da arquitetura proíbe um módulo de alcançar o interior do outro, e a
 * alternativa — duplicar o formato do `jsonb` nos dois — é exatamente o tipo de
 * cópia que diverge na primeira mudança e só se descobre com dado errado no
 * banco.
 *
 * Este arquivo é **TypeScript puro**: sem SDK do Supabase, sem React, sem Next.
 * A LEITURA da coluna continua em cada `infrastructure/`, que é onde o acesso a
 * banco pode morar. O que se compartilha aqui é a forma do dado e as regras
 * sobre ele.
 */

/** Dia da semana no padrão ISO-8601: 1 = segunda-feira … 7 = domingo. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

/**
 * O expediente de um dia.
 *
 * # Um turno por dia, e isto é uma limitação conhecida
 *
 * Clínica com intervalo de almoço tem dois turnos — 08:00–12:00 e 13:00–18:00 —
 * e este formato não os representa. A tela declara a limitação em vez de deixar
 * a pessoa descobrir que o intervalo sumiu depois de salvar.
 */
export interface BusinessDay {
  weekday: Weekday
  /** Quando true, `opensAt` e `closesAt` são ignorados. */
  closed: boolean
  /** 'HH:mm' no relógio local da clínica. */
  opensAt: string
  /** 'HH:mm'. Sempre depois de `opensAt` — o schema recusa o contrário. */
  closesAt: string
}

/** Os sete dias, sempre completos e sempre em ordem. */
export type BusinessHours = readonly BusinessDay[]

export const WEEKDAYS: readonly Weekday[] = [1, 2, 3, 4, 5, 6, 7]

/** Nomes por extenso. Usados na tela de configurações e nas mensagens da agenda. */
export const weekdayLabels: Record<Weekday, string> = {
  1: 'Segunda-feira',
  2: 'Terça-feira',
  3: 'Quarta-feira',
  4: 'Quinta-feira',
  5: 'Sexta-feira',
  6: 'Sábado',
  7: 'Domingo',
}

/**
 * O expediente que uma clínica sem configuração salva exibe.
 *
 * Não é um chute neutro: é o horário comercial mais comum no Brasil, com sábado
 * pela manhã e domingo fechado. Padrão que já está quase certo é padrão que a
 * pessoa confere e aceita; padrão vazio (todos os dias fechados) obrigaria a
 * preencher sete linhas antes de a tela servir para alguma coisa.
 *
 * **Este padrão nunca é imposto à agenda.** Ver `parseStoredBusinessHours`: só
 * horário efetivamente salvo (`source === 'stored'`) bloqueia agendamento.
 */
export const DEFAULT_BUSINESS_HOURS: BusinessHours = [
  { weekday: 1, closed: false, opensAt: '08:00', closesAt: '18:00' },
  { weekday: 2, closed: false, opensAt: '08:00', closesAt: '18:00' },
  { weekday: 3, closed: false, opensAt: '08:00', closesAt: '18:00' },
  { weekday: 4, closed: false, opensAt: '08:00', closesAt: '18:00' },
  { weekday: 5, closed: false, opensAt: '08:00', closesAt: '18:00' },
  { weekday: 6, closed: false, opensAt: '08:00', closesAt: '12:00' },
  { weekday: 7, closed: true, opensAt: '08:00', closesAt: '12:00' },
]

/** 'HH:mm' em relógio de 24 horas. */
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/

export const businessDaySchema = z.object({
  weekday: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
    z.literal(7),
  ]),
  closed: z.boolean(),
  opensAt: z.string().regex(TIME_PATTERN),
  closesAt: z.string().regex(TIME_PATTERN),
})

/**
 * O formato guardado em `clinic_settings.business_hours`.
 *
 * Um objeto, e não um array puro, porque é o que permite acrescentar chave nova
 * depois (turnos partidos, feriados) sem que a leitura antiga quebre.
 */
export const storedBusinessHoursSchema = z.object({
  days: z.array(businessDaySchema).length(7),
})

/**
 * De onde veio o horário que está em mãos.
 *
 *  - `stored` — lido do banco e reconhecido. **É o único que a agenda impõe.**
 *  - `default` — não há configuração salva ainda.
 *  - `unrecognized` — há algo salvo que este código não sabe ler.
 */
export type BusinessHoursSource = 'stored' | 'default' | 'unrecognized'

export interface ParsedBusinessHours {
  value: BusinessHours
  source: BusinessHoursSource
}

/** `null`, `{}` ou `[]` — as três formas de "nada foi configurado". */
function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (Array.isArray(value)) return value.length === 0

  return typeof value === 'object' && Object.keys(value).length === 0
}

/**
 * Lê a coluna `jsonb` com o mesmo contrato com que ela foi escrita.
 *
 * O terceiro estado — `unrecognized` — é o que impede uma perda silenciosa:
 * quando há algo salvo que este código não entende, quem abrir a tela precisa
 * saber ANTES de clicar em salvar, senão substitui uma configuração que nunca
 * chegou a ver.
 *
 * Vazio NÃO é formato desconhecido. `clinic_settings.business_hours` é NOT NULL,
 * então uma clínica recém-criada tem `{}` gravado ali; tratar isso como
 * 'unrecognized' faria TODA clínica nova abrir a tela com um aviso de perda
 * iminente — e aviso que aparece sempre é aviso que ninguém lê.
 */
export function parseStoredBusinessHours(value: unknown): ParsedBusinessHours {
  if (isEmpty(value)) {
    return { value: DEFAULT_BUSINESS_HOURS, source: 'default' }
  }

  const parsed = storedBusinessHoursSchema.safeParse(value)
  if (!parsed.success) {
    return { value: DEFAULT_BUSINESS_HOURS, source: 'unrecognized' }
  }

  return { value: parsed.data.days, source: 'stored' }
}

/**
 * Entidade -> o objeto simples que vai para a coluna `jsonb`.
 *
 * O tipo de retorno é anônimo, e não `BusinessDay[]`, por uma exigência do
 * TypeScript: `Json` do Supabase é um tipo com assinatura de índice, e interface
 * declarada não ganha assinatura implícita — tipo literal ganha. Trocar por
 * `BusinessDay[]` aqui obrigaria um `as` no adapter, que é justamente o lugar
 * onde a checagem ainda vale a pena.
 */
export function businessHoursToJson(hours: BusinessHours): {
  days: { weekday: number; closed: boolean; opensAt: string; closesAt: string }[]
} {
  return {
    days: hours.map((day) => ({
      weekday: day.weekday,
      closed: day.closed,
      opensAt: day.opensAt,
      closesAt: day.closesAt,
    })),
  }
}

/** 'HH:mm' -> minutos desde a meia-noite. */
function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

/**
 * Dia da semana ISO de uma data, lido pelo relógio LOCAL.
 *
 * `Date.getDay()` devolve 0 para domingo; o formato guardado usa 1–7 com domingo
 * no fim. A conversão vive aqui, num lugar só.
 *
 * **Os acessadores locais são obrigatórios, não uma escolha.** `startsAt` é
 * construído com `new Date(ano, mês, dia, hora, minuto)` no schema da agenda —
 * o construtor local. Ler de volta com `getUTCDay()`/`getUTCHours()` compararia
 * um valor com a régua errada e recusaria agendamentos válidos toda vez que o
 * servidor não estivesse em UTC−0. Os dois lados precisam continuar sendo o
 * mesmo relógio.
 */
export function isoWeekdayOf(date: Date): Weekday {
  const day = date.getDay()
  return (day === 0 ? 7 : day) as Weekday
}

export type OutsideHoursReason = 'closed' | 'before-opening' | 'after-closing'

export interface OutsideHoursVerdict {
  weekday: Weekday
  reason: OutsideHoursReason
  /** O expediente daquele dia, para a mensagem poder dizer qual é. */
  day: BusinessDay
}

/**
 * O intervalo cabe no expediente do dia?
 *
 * Devolve `null` quando cabe. Fora dele, devolve o motivo — a mensagem precisa
 * distinguir "a clínica não abre nesse dia" de "abre, mas não a essa hora",
 * porque a ação que a pessoa toma é diferente.
 *
 * Atendimento que termina exatamente no horário de fechamento CABE: quem fecha
 * às 18h atende até as 18h.
 */
export function findOutsideBusinessHours(
  hours: BusinessHours,
  startsAt: Date,
  endsAt: Date,
): OutsideHoursVerdict | null {
  const weekday = isoWeekdayOf(startsAt)
  const day = hours.find((entry) => entry.weekday === weekday)

  // Semana incompleta é dado corrompido, não permissão: sem o dia, não há
  // expediente declarado para comparar, e recusar seria inventar uma regra.
  if (!day) return null

  if (day.closed) return { weekday, reason: 'closed', day }

  const startMinutes = startsAt.getHours() * 60 + startsAt.getMinutes()

  if (startMinutes < toMinutes(day.opensAt)) {
    return { weekday, reason: 'before-opening', day }
  }

  /*
   * Atendimento que atravessa a meia-noite sai do expediente por definição: o
   * dia seguinte tem outro horário, e comparar o fim com o expediente de ontem
   * daria "cabe" para uma consulta das 23:30 às 00:30.
   */
  const endsOnAnotherDay =
    endsAt.getFullYear() !== startsAt.getFullYear() ||
    endsAt.getMonth() !== startsAt.getMonth() ||
    endsAt.getDate() !== startsAt.getDate()

  if (endsOnAnotherDay) return { weekday, reason: 'after-closing', day }

  const endMinutes = endsAt.getHours() * 60 + endsAt.getMinutes()

  if (endMinutes > toMinutes(day.closesAt)) {
    return { weekday, reason: 'after-closing', day }
  }

  return null
}

/** Texto em pt-BR do veredito. Usado pela agenda ao pedir confirmação. */
export function describeOutsideHours(verdict: OutsideHoursVerdict): string {
  const label = weekdayLabels[verdict.weekday]

  // As duas frases começam pelo dia, e não por "A clínica…", porque é o dia que
  // a pessoa precisa reconhecer para decidir — o resto ela já sabe.
  if (verdict.reason === 'closed') {
    return `${label}: a clínica não atende neste dia.`
  }

  return `${label}: a clínica atende das ${verdict.day.opensAt} às ${verdict.day.closesAt}.`
}

/** Nomes curtos, para frases que listam vários dias seguidos. */
const shortWeekdayLabels: Record<Weekday, string> = {
  1: 'segunda',
  2: 'terça',
  3: 'quarta',
  4: 'quinta',
  5: 'sexta',
  6: 'sábado',
  7: 'domingo',
}

/**
 * O expediente inteiro em UMA frase.
 *
 * # Para que isto existe
 *
 * O assistente de WhatsApp precisa afirmar o horário sem inventá-lo. Testado
 * contra a API real, um modelo sem esse dado responde "atendemos das 8h às 12h"
 * com toda a confiança — e o paciente aparece num sábado em que a clínica está
 * fechada.
 *
 * Dias seguidos com o MESMO horário viram faixa ('segunda a sexta'), porque a
 * alternativa — sete linhas — ocupa o contexto do modelo com repetição e sai
 * pior quando ele resume por conta própria.
 *
 * Devolve `null` quando a clínica não atende em nenhum dia: melhor a IA dizer
 * que confirma com a equipe do que anunciar que está sempre fechada.
 */
export function describeBusinessHours(hours: BusinessHours): string | null {
  const abertos = WEEKDAYS.map((weekday) =>
    hours.find((day) => day.weekday === weekday),
  ).filter((day): day is BusinessDay => !!day && !day.closed)

  if (abertos.length === 0) return null

  const faixas: { inicio: Weekday; fim: Weekday; opensAt: string; closesAt: string }[] =
    []

  for (const day of abertos) {
    const ultima = faixas.at(-1)

    // Continua a faixa só se for o dia seguinte E o mesmo horário: um pulo no
    // meio da semana (fecha na quarta) precisa virar duas faixas, senão a frase
    // afirma um dia de atendimento que não existe.
    if (
      ultima &&
      ultima.fim === day.weekday - 1 &&
      ultima.opensAt === day.opensAt &&
      ultima.closesAt === day.closesAt
    ) {
      ultima.fim = day.weekday
      continue
    }

    faixas.push({
      inicio: day.weekday,
      fim: day.weekday,
      opensAt: day.opensAt,
      closesAt: day.closesAt,
    })
  }

  return faixas
    .map((faixa) => {
      const periodo =
        faixa.inicio === faixa.fim
          ? shortWeekdayLabels[faixa.inicio]
          : faixa.fim === faixa.inicio + 1
            ? `${shortWeekdayLabels[faixa.inicio]} e ${shortWeekdayLabels[faixa.fim]}`
            : `${shortWeekdayLabels[faixa.inicio]} a ${shortWeekdayLabels[faixa.fim]}`

      return `${periodo}, das ${faixa.opensAt} às ${faixa.closesAt}`
    })
    .join('; ')
}
