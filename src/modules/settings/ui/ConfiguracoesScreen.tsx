import { Info } from 'lucide-react'
import type { ReactNode } from 'react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader } from '@/components/ui/card'

import {
  IntegrationCredentialsPanel,
  type IntegrationCredentialsPanelProps,
} from '@/modules/integrations'

import type { ClinicSettingsDto } from '../schemas/settings.schema'
import { AppointmentDefaultsForm } from './AppointmentDefaultsForm'
import { BusinessHoursForm } from './BusinessHoursForm'
import { ClinicIdentityForm } from './ClinicIdentityForm'
import { NotificationPreferencesForm } from './NotificationPreferencesForm'

export interface ConfiguracoesScreenProps {
  settings: ClinicSettingsDto
  /** `clinic.settings` na matriz de I-05 — hoje `owner` e `admin`. */
  canManage: boolean
  /**
   * O card de perfil pessoal, montado pela ROTA.
   *
   * Chega como slot, e não como dados, porque perfil é do módulo `identity` e
   * clínica é do `settings` — um módulo não alcança o interior do outro (regra
   * 4). É o mesmo desenho do seletor de clínicas na casca da aplicação.
   */
  profileSlot?: ReactNode
  isLive?: boolean
  integrationCredentials: IntegrationCredentialsPanelProps['overview']
}

/**
 * Configurações da clínica — feature **C-01**.
 *
 * Substitui a tela de vitrine que vivia em `OperationsScreens.tsx`, onde cinco
 * seções — perfil, clínica, notificações, aparência, segurança — mostravam
 * formulários que não gravavam nada.
 *
 * # O critério que decidiu o que entra
 *
 * Uma configuração só aparece aqui se for **fato** (a identidade da empresa) ou
 * se **algo a consome** (a duração padrão da agenda e, desde A-02, o horário de
 * funcionamento — a agenda pede confirmação para atendimento fora dele).
 *
 * `notification_prefs` possui um controle porque os produtores de agenda,
 * recepção e financeiro consultam essa preferência antes de criar avisos. As
 * colunas `branding` e `ai_enabled` continuam fora da tela: nada no produto as
 * consome ainda.
 */
export function ConfiguracoesScreen({
  settings,
  canManage,
  profileSlot,
  isLive = false,
  integrationCredentials,
}: ConfiguracoesScreenProps) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Gestão da clínica"
        title="Configurações"
        description="Os dados e as preferências desta clínica."
      />

      {isLive ? null : (
        <p
          role="status"
          className="rounded-card border border-border-card bg-surface px-4 py-3 text-aux text-muted"
        >
          Modo demonstração: as configurações abaixo são de exemplo e nenhuma
          alteração é salva.
        </p>
      )}

      {canManage ? null : (
        <p
          role="status"
          className="rounded-card border border-border-card bg-surface px-4 py-3 text-aux text-muted"
        >
          Você pode consultar as configurações desta clínica, mas alterá-las é
          responsabilidade de quem administra.
        </p>
      )}

      {/*
        O perfil pessoal vem primeiro: é o único card desta tela que TODO mundo
        pode editar. Quem não administra a clínica encontra o que veio fazer sem
        passar por três cartões somente-leitura.
      */}
      {profileSlot}

      <ClinicIdentityForm
        profile={settings.profile}
        canManage={canManage}
        isLive={isLive}
      />

      <BusinessHoursForm
        days={settings.days}
        hoursSource={settings.hoursSource}
        canManage={canManage}
        isLive={isLive}
      />

      <AppointmentDefaultsForm
        durationMinutes={settings.durationMinutes}
        canManage={canManage}
        isLive={isLive}
      />

      <NotificationPreferencesForm
        operational={settings.notificationPreferences.operational}
        canManage={canManage}
        isLive={isLive}
      />

      <IntegrationCredentialsPanel
        overview={integrationCredentials}
        canManage={canManage}
        isLive={isLive}
      />

      <Card className="overflow-hidden">
        <CardHeader
          title="Definido na criação da clínica"
          description="Estes valores não são editáveis por aqui."
        />
        <dl className="grid gap-4 px-5 pb-5 sm:grid-cols-3">
          <div>
            <dt className="text-label text-muted">Endereço da clínica</dt>
            <dd className="mt-1 text-aux font-semibold text-foreground">
              {settings.profile.slug}
            </dd>
            {/*
              Trocar o slug quebraria silenciosamente todo link já compartilhado,
              e não há redirecionamento do endereço antigo.
            */}
            <dd className="mt-1 text-label text-muted">
              Alterá-lo invalidaria os links já compartilhados.
            </dd>
          </div>

          <div>
            <dt className="text-label text-muted">Fuso horário</dt>
            <dd className="mt-1 text-aux font-semibold text-foreground">
              {settings.profile.timezone}
            </dd>
            {/*
              Read-only por honestidade: nenhum caminho do produto lê esta coluna
              hoje — datas e horas são renderizadas pelo relógio do dispositivo.
              Um seletor aqui gravaria o fuso sem mudar nada do que a agenda
              mostra, e a pessoa acreditaria ter resolvido o problema.
            */}
            <dd className="mt-1 text-label text-muted">
              As datas na tela seguem o relógio do seu dispositivo.
            </dd>
          </div>

          <div>
            <dt className="text-label text-muted">Idioma</dt>
            <dd className="mt-1 text-aux font-semibold text-foreground">
              {settings.profile.locale}
            </dd>
            <dd className="mt-1 text-label text-muted">
              O sistema existe apenas em português do Brasil.
            </dd>
          </div>
        </dl>
      </Card>

      <p className="flex items-start gap-2.5 text-label text-muted">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        Aparência e marca continuam somente leitura até existirem consumidores
        reais para essas configurações.
      </p>
    </div>
  )
}
