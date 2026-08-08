import type { AppointmentDefaults } from './ClinicSettings'

/**
 * 30 minutos — o mesmo valor que o formulário de agendamento já assumia.
 *
 * O padrão do HORÁRIO de funcionamento não está aqui: mora em
 * `lib/clinic/business-hours`, junto do formato da coluna, porque a agenda
 * (A-02) precisa do mesmo valor para saber quando NÃO impor nada.
 */
export const DEFAULT_APPOINTMENT_DEFAULTS: AppointmentDefaults = {
  durationMinutes: 30,
}
