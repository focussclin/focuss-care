import type {
  BusinessDay,
  BusinessHours,
  BusinessHoursSource,
  Weekday,
} from '@/lib/clinic/business-hours'
import type { NotificationPreferences } from '@/lib/notifications/preferences'

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
 *
 * # O horário de funcionamento não é definido aqui
 *
 * `BusinessDay` e companhia vivem em `lib/clinic/business-hours`, porque a
 * agenda (A-02) verifica o mesmo dado que esta tela edita — e a regra 4 impede
 * um módulo de alcançar o interior do outro. O tipo é reexportado para que quem
 * lê este arquivo encontre o vocabulário completo.
 */
export type { BusinessDay, BusinessHours, BusinessHoursSource, Weekday }

/**
 * Padrões que a agenda assume quando ninguém escolhe nada.
 *
 * Diferente do horário de funcionamento, isto **já é consumido**: o formulário
 * de novo agendamento (A-01) abre com esta duração selecionada.
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

export interface ClinicSettings {
  profile: ClinicProfile
  businessHours: BusinessHours
  businessHoursSource: BusinessHoursSource
  appointmentDefaults: AppointmentDefaults
  notificationPreferences: NotificationPreferences
}
