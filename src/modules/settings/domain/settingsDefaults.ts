import type { AppointmentDefaults, BusinessHours } from './ClinicSettings'

/**
 * O expediente que uma clínica sem configuração salva exibe.
 *
 * Não é um chute neutro: é o horário comercial mais comum no Brasil, com sábado
 * pela manhã e domingo fechado. Padrão que já está quase certo é padrão que a
 * pessoa confere e aceita; padrão vazio (todos os dias fechados) obrigaria a
 * preencher sete linhas antes de a tela servir para alguma coisa.
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

/** 30 minutos — o mesmo valor que o formulário de agendamento já assumia. */
export const DEFAULT_APPOINTMENT_DEFAULTS: AppointmentDefaults = {
  durationMinutes: 30,
}
