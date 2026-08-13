import type {
  AppointmentDefaults,
  BusinessHours,
  ClinicProfile,
  ClinicProfileInput,
  ClinicSettings,
} from './ClinicSettings'
import type { NotificationPreferences } from '@/lib/notifications/preferences'

/**
 * PORTA das configurações da clínica.
 *
 * # O que NÃO está aqui
 *
 * **Não há `delete`.** Configuração não se apaga: o horário volta a ser o padrão,
 * a razão social volta a ficar em branco. Uma clínica sem linha em
 * `clinic_settings` é indistinguível de uma clínica recém-criada, e essa
 * ambiguidade não ajuda ninguém.
 *
 * **Não há escrita de `slug`, `timezone` nem `locale`.** Os três aparecem em
 * `ClinicProfile` porque a tela os MOSTRA; nenhum entra em `ClinicProfileInput`.
 * O motivo de cada um está no cabeçalho de `ClinicSettings.ts`.
 *
 * **Não há `updateBranding` nem `updateAi`.** As colunas existem em
 * `clinic_settings` (`branding`, `ai_enabled`), mas nada no produto as consome
 * hoje. A preferência de avisos tem método próprio porque os produtores de
 * agenda, recepção e financeiro já a consultam antes de criar notificações.
 */
export interface ClinicSettingsRepository {
  /**
   * Tudo o que a tela precisa, em uma chamada.
   *
   * Nunca falha por configuração ausente: clínica sem linha em `clinic_settings`
   * devolve os padrões do módulo, com `businessHoursSource: 'default'`.
   */
  load(clinicId: string): Promise<ClinicSettings>

  /** Identidade — nome fantasia, razão social, CNPJ. */
  updateProfile(
    clinicId: string,
    input: ClinicProfileInput,
  ): Promise<ClinicProfile>

  /**
   * Horário de funcionamento.
   *
   * Desde **A-02** isto tem efeito na agenda: atendimento fora do horário salvo
   * pede confirmação antes de ser gravado.
   *
   * Recebe os **sete** dias, sempre. Um PATCH por dia pareceria mais econômico e
   * seria mais frágil: duas pessoas editando dias diferentes na mesma tela
   * gravariam a partir de leituras diferentes, e o último a salvar decidiria o
   * dia do outro sem que ninguém percebesse. Enviar a semana inteira torna o
   * conflito visível — quem salvar depois sobrescreve o que está vendo.
   */
  updateBusinessHours(
    clinicId: string,
    hours: BusinessHours,
  ): Promise<BusinessHours>

  /** Padrões que a agenda assume. */
  updateAppointmentDefaults(
    clinicId: string,
    defaults: AppointmentDefaults,
  ): Promise<AppointmentDefaults>

  /** Ativa ou silencia os avisos operacionais do centro in-app. */
  updateNotificationPreferences(
    clinicId: string,
    preferences: NotificationPreferences,
  ): Promise<NotificationPreferences>

  /**
   * Autoriza — ou revoga — a IA a responder paciente em nome da clínica.
   *
   * # Por que isto merece um método, e não um campo num formulário grande
   *
   * É a única configuração do produto que decide se uma **máquina fala com
   * paciente**. Todo o resto ajusta como a clínica trabalha; esta muda quem
   * responde quando alguém escreve no WhatsApp.
   *
   * Enquanto não existia superfície, o único jeito de desligar era apagar a
   * credencial da OpenAI — ou seja, quem quisesse parar a IA por uma tarde teria
   * de reconfigurar a integração para voltar.
   */
  setAiEnabled(clinicId: string, enabled: boolean): Promise<boolean>
}
