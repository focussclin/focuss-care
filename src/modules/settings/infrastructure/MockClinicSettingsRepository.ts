import { EMPTY_CLINIC_ADDRESS } from '@/lib/clinic/address'

import type {
  AppointmentDefaults,
  BusinessHours,
  ClinicSettings,
} from '../domain/ClinicSettings'
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from '@/lib/notifications/preferences'
import type { ClinicSettingsRepository } from '../domain/ClinicSettingsRepository'
import { ClinicSettingsError } from '../domain/ClinicSettingsError'
import { DEFAULT_BUSINESS_HOURS } from '@/lib/clinic/business-hours'

import { DEFAULT_APPOINTMENT_DEFAULTS } from '../domain/settingsDefaults'

/**
 * Fallback usado enquanto o Supabase não está configurado.
 *
 * A clínica de demonstração mostra os padrões do módulo — não há um segundo
 * conjunto de dados fictícios sendo inventado aqui.
 */
export class MockClinicSettingsRepository implements ClinicSettingsRepository {
  async load(clinicId: string): Promise<ClinicSettings> {
    return {
      profile: {
        id: clinicId,
        slug: 'clinica-demonstracao',
        tradeName: 'Clínica de demonstração',
        legalName: null,
        cnpj: null,
        phone: null,
        email: null,
        address: EMPTY_CLINIC_ADDRESS,
        timezone: 'America/Sao_Paulo',
        locale: 'pt-BR',
      },
      businessHours: DEFAULT_BUSINESS_HOURS,
      businessHoursSource: 'default',
      appointmentDefaults: DEFAULT_APPOINTMENT_DEFAULTS,
      notificationPreferences: DEFAULT_NOTIFICATION_PREFERENCES,
      // Demonstração nunca mostra a IA ligada: não há credencial, não há
      // paciente e não há para onde a mensagem ir.
      aiEnabled: false,
    }
  }

  /**
   * Escrita não existe na demonstração.
   *
   * Devolver o objeto alterado daria "salvo" para algo que não saiu da memória
   * do processo — e a pessoa só descobriria na próxima visita, quando o horário
   * que ela configurou tivesse voltado ao padrão.
   */
  async updateProfile(): Promise<never> {
    return this.refuseWrite('updateProfile')
  }

  async updateBusinessHours(): Promise<BusinessHours> {
    return this.refuseWrite('updateBusinessHours')
  }

  async updateAppointmentDefaults(): Promise<AppointmentDefaults> {
    return this.refuseWrite('updateAppointmentDefaults')
  }

  async updateNotificationPreferences(): Promise<NotificationPreferences> {
    return this.refuseWrite('updateNotificationPreferences')
  }

  /**
   * Recusa como as demais — e aqui a recusa vale mais que nas outras.
   *
   * Devolver `true` faria a tela de demonstração exibir a IA como ligada,
   * respondendo pacientes que não existem, com uma credencial que não está
   * configurada. É a fantasia mais cara que este repositório poderia sustentar.
   */
  async setAiEnabled(): Promise<boolean> {
    return this.refuseWrite('setAiEnabled')
  }

  private refuseWrite(operation: string): never {
    throw new ClinicSettingsError(
      'unavailable',
      `MockClinicSettingsRepository nao persiste (${operation}): escrita real exige Supabase configurado.`,
    )
  }
}
