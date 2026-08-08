import { Info } from 'lucide-react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Card, CardHeader } from '@/components/ui/card'

import type { ClinicSettingsDto } from '../schemas/settings.schema'
import { AppointmentDefaultsForm } from './AppointmentDefaultsForm'
import { BusinessHoursForm } from './BusinessHoursForm'
import { ClinicIdentityForm } from './ClinicIdentityForm'

export interface ConfiguracoesScreenProps {
  settings: ClinicSettingsDto
  /** `clinic.settings` na matriz de I-05 — hoje `owner` e `admin`. */
  canManage: boolean
  isLive?: boolean
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
 * se **algo a consome** (a duração padrão da agenda). O horário de funcionamento
 * é o caso de fronteira: é fato declarado, mas ninguém o impõe ainda, e por isso
 * carrega a ressalva explícita no próprio formulário.
 *
 * As colunas `notification_prefs`, `branding` e `ai_enabled` existem em
 * `clinic_settings` e **não** ganharam controle. Um botão que grava preferência
 * de notificação enquanto nenhum caminho envia notificação não é um recurso
 * incompleto — é um recurso falso, e quem o usa para de conferir se o aviso
 * chegou. O rodapé diz isso em vez de deixar a ausência parecer esquecimento.
 */
export function ConfiguracoesScreen({
  settings,
  canManage,
  isLive = false,
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
        Notificações, aparência, marca e integrações ainda não têm ajuste aqui —
        não porque falta a tela, mas porque falta o que elas controlariam:
        nenhum caminho do sistema envia aviso automático nem aplica logotipo
        ainda. Seus dados pessoais de acesso também não são alterados por aqui.
      </p>
    </div>
  )
}
