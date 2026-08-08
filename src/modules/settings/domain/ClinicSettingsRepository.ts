import type {
  AppointmentDefaults,
  BusinessHours,
  ClinicProfile,
  ClinicProfileInput,
  ClinicSettings,
} from './ClinicSettings'

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
 * **Não há `updateBranding` nem `updateNotifications`.** As colunas existem em
 * `clinic_settings` (`branding`, `notification_prefs`, `ai_enabled`), e é
 * justamente por existirem que a ausência precisa estar escrita: nada no produto
 * as lê hoje. Gravar preferência de notificação enquanto nenhum caminho envia
 * notificação é prometer um comportamento que não acontece.
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
}
