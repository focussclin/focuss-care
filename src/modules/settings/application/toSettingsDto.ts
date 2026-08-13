import type {
  BusinessHours,
  ClinicProfile,
  ClinicSettings,
} from '../domain/ClinicSettings'
import type {
  BusinessDayDto,
  ClinicProfileDto,
  ClinicSettingsDto,
} from '../schemas/settings.schema'

/**
 * Entidade -> o que atravessa a fronteira.
 *
 * `clinics.id` NÃO viaja. A tela nunca precisa dele — a Server Action resolve a
 * clínica ativa pelo servidor (`current_clinic_id()`), e um id de tenant que
 * chega ao navegador só serve para alguém tentar mandá-lo de volta.
 */
export function toClinicProfileDto(profile: ClinicProfile): ClinicProfileDto {
  return {
    slug: profile.slug,
    tradeName: profile.tradeName,
    legalName: profile.legalName,
    cnpj: profile.cnpj,
    phone: profile.phone,
    email: profile.email,
    address: profile.address,
    timezone: profile.timezone,
    locale: profile.locale,
  }
}

export function toBusinessDayDtos(
  hours: BusinessHours,
): readonly BusinessDayDto[] {
  return hours.map((day) => ({
    weekday: day.weekday,
    closed: day.closed,
    opensAt: day.opensAt,
    closesAt: day.closesAt,
  }))
}

export function toClinicSettingsDto(
  settings: ClinicSettings,
): ClinicSettingsDto {
  return {
    profile: toClinicProfileDto(settings.profile),
    days: toBusinessDayDtos(settings.businessHours),
    hoursSource: settings.businessHoursSource,
    durationMinutes: settings.appointmentDefaults.durationMinutes,
    notificationPreferences: settings.notificationPreferences,
  }
}
