/**
 * Configuração da clínica — feature **C-01**.
 *
 * # Duas tabelas, uma tela
 *
 * O que a tela chama de "configurações" mora em dois lugares diferentes, e a
 * separação não é arbitrária:
 *
 *  - **`clinics`** guarda a IDENTIDADE — nome, razão social, CNPJ. São fatos
 *    sobre a empresa, e outras partes do sistema dependem deles (a fatura de
 *    B-01 imprime razão social e CNPJ).
 *  - **`clinic_settings`** guarda PREFERÊNCIA de operação — horário de
 *    funcionamento, padrões de agendamento. São escolhas, não fatos, e mudam
 *    sem que nada no passado mude de sentido.
 *
 * # O que NÃO é editável aqui, e por quê
 *
 *  - **`slug`** identifica a clínica em endereço. Trocá-lo quebra silenciosamente
 *    todo link já compartilhado, e não há redirecionamento do antigo.
 *  - **`timezone` e `locale`** aparecem só para leitura. Hoje **nenhum caminho do
 *    produto os lê**: data e hora são renderizadas pelo relógio do dispositivo.
 *    Um seletor que grava o fuso sem mudar o que a agenda mostra seria pior que
 *    a ausência — a pessoa acreditaria ter resolvido um problema que continua lá.
 */

/** Dia da semana no padrão ISO-8601: 1 = segunda-feira … 7 = domingo. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

/**
 * O expediente de um dia.
 *
 * # Um turno por dia, e isto é uma limitação conhecida
 *
 * Clínica com intervalo de almoço tem dois turnos — 08:00–12:00 e 13:00–18:00 —
 * e este formato não os representa. Modelar turnos partidos dobra a interface, e
 * a fatia que vai CONSUMIR o horário (A-02, bloqueio de agendamento fora do
 * expediente) ainda não existe para dizer de quanta precisão ela precisa.
 *
 * A tela declara a limitação em vez de deixar a pessoa descobrir que o intervalo
 * sumiu depois de salvar.
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

/**
 * Padrões que a agenda assume quando ninguém escolhe nada.
 *
 * Diferente do horário de funcionamento, isto **já é consumido hoje**: o
 * formulário de novo agendamento (A-01) abre com esta duração selecionada.
 */
export interface AppointmentDefaults {
  durationMinutes: number
}

/** Identidade da clínica — o que vive em `clinics`. */
export interface ClinicProfile {
  id: string
  /** Somente leitura nesta fatia. Ver o cabeçalho do arquivo. */
  slug: string
  tradeName: string
  legalName: string | null
  cnpj: string | null
  /** Somente leitura: nada no produto o consome ainda. */
  timezone: string
  /** Somente leitura: só existe pt-BR. */
  locale: string
}

/** O que o formulário de identidade pode alterar. Nem `slug`, nem `timezone`. */
export interface ClinicProfileInput {
  tradeName: string
  legalName: string | null
  cnpj: string | null
}

/**
 * De onde veio o horário que está na tela.
 *
 * Existe por causa de um risco concreto: `clinic_settings.business_hours` é uma
 * coluna `jsonb` livre, que um seed, uma migration futura ou outra ferramenta
 * podem ter preenchido num formato que este código não entende. Se nesse caso a
 * tela simplesmente mostrasse o padrão, a primeira pessoa a clicar em "Salvar"
 * apagaria uma configuração que nunca chegou a ver.
 *
 *  - `stored` — lido do banco e reconhecido.
 *  - `default` — não há configuração salva ainda.
 *  - `unrecognized` — há algo salvo que este código não sabe ler. A tela avisa
 *    ANTES de deixar salvar.
 */
export type BusinessHoursSource = 'stored' | 'default' | 'unrecognized'

export interface ClinicSettings {
  profile: ClinicProfile
  businessHours: BusinessHours
  businessHoursSource: BusinessHoursSource
  appointmentDefaults: AppointmentDefaults
}
