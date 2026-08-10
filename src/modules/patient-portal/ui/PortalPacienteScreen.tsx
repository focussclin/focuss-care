import { CalendarClock, IdCard, ReceiptText, ShieldCheck } from 'lucide-react'

import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusBadge } from '@/components/ui/status-badge'

import type {
  PortalAppointmentDto,
  PortalInvoiceDto,
  PortalProfileDto,
} from '../schemas/patientPortal.schema'

export interface PortalPacienteScreenProps {
  profile: PortalProfileDto
  upcoming: readonly PortalAppointmentDto[]
  past: readonly PortalAppointmentDto[]
  invoices: readonly PortalInvoiceDto[]
}

/**
 * O portal do paciente — feature **Portal do paciente**.
 *
 * # O que esta tela nunca mostra
 *
 * Prontuário. Evolução clínica. Anotação interna da recepção. Diagnóstico.
 *
 * A ausência não depende desta tela lembrar de omitir: o que chega aqui vem de
 * funções do banco com lista fechada de colunas, e não existe RPC que alcance
 * `medical_records`. Se alguém acrescentar um campo aqui, ele chega
 * `undefined` — a fronteira está no banco, não no JSX.
 *
 * # Server Component
 *
 * Sem `'use client'` e sem estado: tudo é leitura, e a única interação é rolar.
 */
export function PortalPacienteScreen({
  profile,
  upcoming,
  past,
  invoices,
}: PortalPacienteScreenProps) {
  const open = invoices.filter((invoice) => !invoice.isSettled)

  return (
    <div className="flex flex-col gap-6">
      <header>
        <p className="text-label font-semibold tracking-[0.12em] text-muted uppercase">
          {profile.clinicName ?? 'Sua clínica'}
        </p>
        <h1 className="mt-1 text-[1.75rem] leading-tight font-semibold tracking-[-0.02em] text-foreground">
          Olá, {profile.displayName.split(' ')[0]}
        </h1>
        <p className="mt-1 text-aux text-muted">
          Suas consultas e cobranças nesta clínica.
        </p>
      </header>

      <Card>
        <CardHeader title="Próximas consultas" />

        {upcoming.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="Você não tem consulta marcada."
            description="Quando a clínica agendar, ela aparece aqui."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border-card">
            {upcoming.map((appointment) => (
              <AppointmentRow key={appointment.id} appointment={appointment} />
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader
          title="Cobranças"
          description={
            open.length > 0
              ? `${open.length} em aberto`
              : 'Nada em aberto no momento.'
          }
        />

        {invoices.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title="Nenhuma cobrança registrada."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border-card">
            {invoices.map((invoice) => (
              <li
                key={invoice.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-aux font-semibold text-foreground tabular-nums">
                    {invoice.totalLabel}
                  </span>
                  <span className="block text-label text-muted">
                    {invoice.isSettled
                      ? 'Quitada'
                      : `Falta ${invoice.outstandingLabel}`}
                    {invoice.dueLabel ? ` · vence ${invoice.dueLabel}` : ''}
                  </span>
                </span>

                <StatusBadge tone={invoice.statusTone}>
                  {invoice.statusLabel}
                </StatusBadge>
              </li>
            ))}
          </ul>
        )}

        {/*
          O portal MOSTRA, e não cobra.

          Não há botão de pagar porque não há gateway — e um botão que abre um
          PIX inventado seria pior que a ausência dele. Dizer para onde ir é o
          que esta tela pode fazer com honestidade hoje.
        */}
        <p className="border-t border-border-card px-5 py-3 text-label leading-5 text-muted">
          O pagamento é feito na clínica. Este portal mostra os valores, mas não
          recebe pagamento.
        </p>
      </Card>

      {past.length > 0 ? (
        <Card>
          <CardHeader title="Histórico" />
          <ul className="flex flex-col divide-y divide-border-card">
            {past.map((appointment) => (
              <AppointmentRow key={appointment.id} appointment={appointment} />
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Seus dados" />
        <dl className="grid gap-4 px-5 pb-5 sm:grid-cols-2">
          <Field label="Nome" value={profile.legalName} />
          <Field label="Nascimento" value={profile.birthLabel} />
          <Field label="E-mail" value={profile.email} />
          <Field label="Telefone" value={profile.phone} />
        </dl>

        <p className="flex items-start gap-2 border-t border-border-card px-5 py-3 text-label leading-5 text-muted">
          <IdCard aria-hidden className="mt-0.5 size-4 shrink-0" />
          Para corrigir qualquer dado acima, fale com a recepção da clínica.
        </p>
      </Card>

      {/*
        Dito em voz alta, e não subentendido pela ausência.

        Quem abre um portal de saúde procura o prontuário. Não encontrar e não
        saber por quê leva a pessoa a achar que a tela está quebrada — e a ligar
        para a clínica perguntando.
      */}
      <p className="flex items-start gap-2 rounded-card border border-border-card bg-surface px-4 py-3 text-label leading-5 text-muted">
        <ShieldCheck aria-hidden className="mt-0.5 size-4 shrink-0" />
        Seu prontuário e as anotações clínicas não ficam neste portal. Eles são
        acessados pela equipe de saúde, e você pode solicitá-los à clínica.
      </p>
    </div>
  )
}

function AppointmentRow({
  appointment,
}: {
  appointment: PortalAppointmentDto
}) {
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4">
      <time
        dateTime={appointment.startsAt}
        className="w-28 shrink-0 text-aux text-muted tabular-nums"
      >
        {appointment.dayLabel} · {appointment.timeLabel.split(' – ')[0]}
      </time>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-aux font-medium text-foreground">
          {appointment.reason ?? 'Consulta'}
        </span>
        {appointment.professionalName ? (
          <span className="block truncate text-label text-muted">
            {appointment.professionalName}
          </span>
        ) : null}
      </span>

      <StatusBadge tone={appointment.statusTone}>
        {appointment.statusLabel}
      </StatusBadge>
    </li>
  )
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-label font-semibold text-label">{label}</dt>
      <dd className="mt-0.5 text-aux text-foreground">
        {value ?? <span className="text-muted">Não informado</span>}
      </dd>
    </div>
  )
}
