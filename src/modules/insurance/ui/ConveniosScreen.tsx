'use client'

import {
  AlertTriangle,
  Building2,
  FileCheck2,
  Info,
  Plus,
  ShieldCheck,
  CreditCard,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { StatCard } from '@/components/ui/stat-card'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import type { AuthorizationStatus } from '@/lib/supabase/database.types'
import { formatShortDate } from '@/lib/utils/date'
import { formatCents } from '@/lib/utils/money'

import {
  answerAuthorizationAction,
  createAuthorizationAction,
} from '../actions/authorizations.action'
import {
  createPatientInsuranceAction,
  setPatientInsuranceActiveAction,
} from '../actions/patientInsurances.action'
import { setProviderActiveAction } from '../actions/providers.action'
import {
  authorizationStatusLabels,
  insuranceMessages,
  type ClaimDenialDto,
  type ClaimInvoiceOptionDto,
  type AuthorizationDto,
  type InsuranceSummaryDto,
  type PatientInsuranceDto,
  type PatientInsuranceRecordDto,
  type PlanDto,
  type ProviderDto,
} from '../schemas/insurance.schema'
import { transitionAuthorizationAction } from '../actions/authorizations.action'
import {
  AUTHORIZATION_TRANSITIONS,
  isAuthorizationExpired,
} from '../domain/Insurance'
import { AnswerAuthorizationModal } from './AnswerAuthorizationModal'
import { ClaimDenialsPanel } from './ClaimDenialsPanel'
import { NewAuthorizationModal } from './NewAuthorizationModal'
import { NewProviderModal } from './NewProviderModal'
import { PatientInsuranceModal } from './PatientInsuranceModal'

export interface ConveniosScreenProps {
  summary: InsuranceSummaryDto
  providers: readonly ProviderDto[]
  plans: readonly PlanDto[]
  authorizations: readonly AuthorizationDto[]
  cards: readonly PatientInsuranceDto[]
  claimDenials: readonly ClaimDenialDto[]
  claimInvoices: readonly ClaimInvoiceOptionDto[]
  patientInsurances: readonly PatientInsuranceRecordDto[]
  patients: readonly { id: string; name: string }[]
  canManage: boolean
  isLive?: boolean
}

const statusTone: Record<string, StatusTone> = {
  requested: 'pending',
  approved: 'positive',
  denied: 'negative',
  canceled: 'negative',
}

/**
 * Convênios — feature **V-01**.
 *
 * Substitui a tela de vitrine que vivia em `OperationsScreens.tsx`, onde três
 * operadoras com "842 pacientes" e "14 guias pendentes" estavam escritas no
 * arquivo.
 *
 * # Uma ausência que a tela declara em vez de esconder
 *
 * **Elegibilidade.** A validade exibida é a que a clínica cadastrou. Nenhuma
 * consulta é feita à operadora, e chamar isso de "elegível" faria a recepção
 * confiar num dado que ninguém confirmou.
 */
export function ConveniosScreen({
  summary,
  providers,
  plans,
  authorizations,
  cards,
  claimDenials,
  claimInvoices,
  patientInsurances,
  patients,
  canManage,
  isLive = false,
}: ConveniosScreenProps) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [creatingProvider, setCreatingProvider] = useState(false)
  const [creatingAuthorization, setCreatingAuthorization] = useState(false)
  const [creatingPatientInsurance, setCreatingPatientInsurance] = useState(false)
  const [answering, setAnswering] = useState<AuthorizationDto | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyAuthorization, setBusyAuthorization] = useState<string | null>(null)
  /*
   * O "agora" é fixado por render, e não lido a cada linha: duas guias na mesma
   * lista não podem ser avaliadas contra relógios diferentes.
   */
  const now = new Date()

  async function transitionAuthorization(
    authorization: AuthorizationDto,
    /*
     * O destino vem da tabela do dominio, que e tipada com o enum inteiro. O
     * schema da action fecha em `used | canceled`; aqui o tipo acompanha a
     * origem, e a action recusa o que nao couber.
     */
    to: AuthorizationStatus,
  ) {
    setBusyAuthorization(authorization.id)
    setError(null)
    try {
      const result = await transitionAuthorizationAction({
        authorizationId: authorization.id,
        // `from` é o estado que ESTA tela viu: vai para o `WHERE` do UPDATE.
        from: authorization.status,
        to,
      })
      if (!result.ok) setError(result.error.message)
      else startTransition(() => router.refresh())
    } catch {
      setError(insuranceMessages.unexpected)
    } finally {
      setBusyAuthorization(null)
    }
  }

  const editable = canManage && isLive

  function refresh() {
    startTransition(() => router.refresh())
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Gestão da clínica"
        title="Convênios"
        description="Operadoras, planos e as guias enviadas a elas."
        actions={
          editable ? (
            <>
              <Button
                variant="secondary"
                onClick={() => setCreatingProvider(true)}
              >
                <Building2 aria-hidden className="size-4" />
                Nova operadora
              </Button>
              <Button
                onClick={() => setCreatingAuthorization(true)}
                disabled={cards.length === 0}
                title={
                  cards.length === 0
                    ? 'Nenhuma carteirinha ativa cadastrada nos pacientes.'
                    : undefined
                }
              >
                <Plus aria-hidden className="size-4" />
                Nova guia
              </Button>
              <Button
                variant="secondary"
                onClick={() => setCreatingPatientInsurance(true)}
                disabled={plans.length === 0 || patients.length === 0}
                title={
                  plans.length === 0
                    ? 'Cadastre um plano ativo antes de criar uma carteirinha.'
                    : patients.length === 0
                      ? 'Cadastre um paciente antes de criar uma carteirinha.'
                      : undefined
                }
              >
                <CreditCard aria-hidden className="size-4" />
                Nova carteirinha
              </Button>
            </>
          ) : undefined
        }
      />

      {isLive ? null : (
        <p
          role="status"
          className="rounded-card border border-border-card bg-surface px-4 py-3 text-aux text-muted"
        >
          Modo demonstração: guia fictícia informaria que um procedimento está
          autorizado, e alguém marcaria o atendimento em cima disso. Esta tela
          não inventa nenhuma.
        </p>
      )}

      {error ? (
        <p
          role="alert"
          className="rounded-card border border-danger/30 bg-danger-surface px-4 py-3 text-aux text-danger"
        >
          {error}
        </p>
      ) : null}

      <section aria-label="Resumo dos convênios">
        <div className="grid grid-cols-2 gap-4 nav:grid-cols-4">
          <StatCard
            label="Operadoras ativas"
            value={String(summary.activeProviders)}
            icon={Building2}
          />
          <StatCard
            label="Planos ativos"
            value={String(summary.activePlans)}
            icon={ShieldCheck}
          />
          <StatCard
            label="Guias aguardando"
            value={String(summary.pendingAuthorizations)}
            icon={FileCheck2}
            tone="attention"
          />
          <StatCard
            label="Guias negadas"
            value={String(summary.deniedAuthorizations)}
            icon={AlertTriangle}
          />
        </div>
      </section>

      <Card className="overflow-hidden">
        <CardHeader
          title="Guias"
          description="Pedidos de autorização e o que a operadora respondeu."
        />

        {authorizations.length === 0 ? (
          <EmptyState
            icon={FileCheck2}
            title="Nenhuma guia registrada."
            description="As solicitações de autorização aparecem aqui, com a resposta da operadora."
          />
        ) : (
          <ul className="divide-y divide-border-card border-t border-border-card">
            {authorizations.map((authorization) => (
              <li
                key={authorization.id}
                className="flex flex-wrap items-start gap-3 px-5 py-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-aux font-semibold text-foreground">
                    {authorization.patientName}
                  </p>
                  <p className="truncate text-label text-muted">
                    {authorization.providerName} · {authorization.planName} ·{' '}
                    {formatShortDate(new Date(authorization.requestedAt))}
                  </p>

                  <ul className="mt-2 flex flex-col gap-0.5">
                    {authorization.procedures.map((procedure, index) => (
                      <li
                        key={`${authorization.id}-${index}`}
                        className="text-label text-muted"
                      >
                        {procedure.quantity}× {procedure.description}
                        {procedure.code ? ` (${procedure.code})` : ''}
                      </li>
                    ))}
                  </ul>

                  {authorization.authorizationNumber ? (
                    <p className="mt-1 text-label text-foreground">
                      Autorização nº {authorization.authorizationNumber}
                      {authorization.expiresAt
                        ? ` · vale até ${formatShortDate(new Date(authorization.expiresAt))}`
                        : ''}
                    </p>
                  ) : null}

                  {authorization.denialReason ? (
                    /*
                      O motivo aparece na íntegra: é o texto que a clínica usa
                      para recorrer, e resumi-lo perderia o termo exato que a
                      operadora empregou.
                    */
                    <p className="mt-1 text-label text-danger">
                      Motivo: {authorization.denialReason}
                    </p>
                  ) : null}
                </div>

                <StatusBadge tone={statusTone[authorization.status] ?? 'pending'}>
                  {authorizationStatusLabels[authorization.status] ??
                    authorization.status}
                </StatusBadge>

                {/*
                  Vencimento é derivado da data, e aparece AO LADO do status
                  gravado — não no lugar dele. A aplicação não escreve
                  `expired`: sem processo que rode todo dia, guia vencida
                  gravada conviveria com outra vencida ainda marcada
                  "Autorizada", e a lista mentiria de duas formas.
                */}
                {isAuthorizationExpired(
                  authorization.status,
                  authorization.expiresAt ? new Date(authorization.expiresAt) : null,
                  now,
                ) ? (
                  <StatusBadge tone="negative">Prazo vencido</StatusBadge>
                ) : null}

                {editable && authorization.status === 'requested' ? (
                  <Button
                    variant="secondary"
                    onClick={() => setAnswering(authorization)}
                  >
                    Registrar resposta
                  </Button>
                ) : null}

                {/*
                  O ciclo que faltava: guia aprovada não tinha para onde ir, e a
                  lista de autorizadas crescia sem distinguir a já usada da que
                  ainda vale. Os destinos saem da tabela do domínio.
                */}
                {editable
                  ? AUTHORIZATION_TRANSITIONS[authorization.status].map((to) => (
                      <Button
                        key={to}
                        variant="ghost"
                        disabled={busyAuthorization === authorization.id}
                        onClick={() =>
                          void transitionAuthorization(authorization, to)
                        }
                      >
                        {to === 'used' ? 'Marcar como utilizada' : 'Cancelar guia'}
                      </Button>
                    ))
                  : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <CardHeader title="Operadoras" description="Com quem a clínica tem contrato." />

          {providers.length === 0 ? (
            <EmptyState icon={Building2} title="Nenhuma operadora cadastrada." />
          ) : (
            <ul className="divide-y divide-border-card border-t border-border-card">
              {providers.map((provider) => (
                <li
                  key={provider.id}
                  className="flex flex-wrap items-center gap-3 px-5 py-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-aux font-semibold text-foreground">
                      {provider.name}
                    </p>
                    <p className="text-label text-muted">
                      {provider.activePlans}{' '}
                      {provider.activePlans === 1
                        ? 'plano ativo'
                        : 'planos ativos'}
                      {provider.ansCode ? ` · ANS ${provider.ansCode}` : ''}
                    </p>
                  </div>

                  <StatusBadge
                    tone={provider.isActive ? 'positive' : 'negative'}
                  >
                    {provider.isActive ? 'Ativa' : 'Inativa'}
                  </StatusBadge>

                  {editable ? (
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        setError(null)
                        const result = await setProviderActiveAction({
                          providerId: provider.id,
                          isActive: !provider.isActive,
                        })
                        if (!result.ok) setError(result.error.message)
                        else refresh()
                      }}
                    >
                      {provider.isActive ? 'Desativar' : 'Reativar'}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="overflow-hidden">
          <CardHeader
            title="Planos"
            description="Coparticipação e prazo de pagamento vêm daqui."
          />

          {plans.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="Nenhum plano cadastrado."
              description="Um plano precisa de uma operadora antes."
            />
          ) : (
            <ul className="divide-y divide-border-card border-t border-border-card">
              {plans.map((plan) => (
                <li
                  key={plan.id}
                  className="flex flex-wrap items-center gap-3 px-5 py-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-aux font-semibold text-foreground">
                      {plan.name}
                    </p>
                    <p className="truncate text-label text-muted">
                      {plan.providerName} · coparticipação{' '}
                      {formatCents(plan.copayCents)} · paga em{' '}
                      {plan.paymentTermDays} dias
                    </p>
                  </div>

                  <StatusBadge tone={plan.isActive ? 'positive' : 'negative'}>
                    {plan.isActive ? 'Ativo' : 'Inativo'}
                  </StatusBadge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card className="overflow-hidden">
        <CardHeader
          title="Carteirinhas de pacientes"
          description="Validade e vínculo cadastrados pela clínica para uso em guias."
        />

        {patientInsurances.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="Nenhuma carteirinha cadastrada."
            description="Cadastre uma carteirinha para vincular paciente e plano antes de solicitar uma guia."
            action={
              editable ? (
                <Button
                  onClick={() => setCreatingPatientInsurance(true)}
                  disabled={plans.length === 0 || patients.length === 0}
                >
                  <Plus aria-hidden className="size-4" />
                  Adicionar carteirinha
                </Button>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-border-card border-t border-border-card">
            {patientInsurances.map((insurance) => (
              <li key={insurance.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-aux font-semibold text-foreground">
                      {insurance.patientName}
                    </p>
                    <StatusBadge tone={insurance.isActive ? 'positive' : 'negative'}>
                      {insurance.isActive ? 'Ativa' : 'Inativa'}
                    </StatusBadge>
                    {insurance.isPrimary ? <StatusBadge tone="pending">Principal</StatusBadge> : null}
                  </div>
                  <p className="truncate text-label text-muted">
                    {insurance.providerName} · {insurance.planName} · cartão {insurance.cardNumber}
                  </p>
                  <p className="text-label text-muted">
                    {insurance.holderName ? `Titular: ${insurance.holderName} · ` : ''}
                    Validade cadastrada: {insurance.validUntil ? formatShortDate(new Date(`${insurance.validUntil}T00:00:00`)) : 'não informada'}
                  </p>
                </div>

                {editable ? (
                  <Button
                    variant="ghost"
                    onClick={async () => {
                      setError(null)
                      const result = await setPatientInsuranceActiveAction({
                        insuranceId: insurance.id,
                        isActive: !insurance.isActive,
                      })
                      if (!result.ok) setError(result.error.message)
                      else refresh()
                    }}
                  >
                    {insurance.isActive ? 'Desativar' : 'Reativar'}
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ClaimDenialsPanel
        denials={claimDenials}
        invoices={claimInvoices}
        canManage={canManage}
        isLive={isLive}
      />

      <p className="flex items-start gap-2.5 text-label text-muted">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        {insuranceMessages.eligibilityUnavailable}
      </p>

      <NewProviderModal
        open={creatingProvider}
        onOpenChange={setCreatingProvider}
        providers={providers}
        onDone={refresh}
      />

      <NewAuthorizationModal
        open={creatingAuthorization}
        onOpenChange={setCreatingAuthorization}
        cards={cards}
        onSubmit={async (values) => {
          const result = await createAuthorizationAction(values)
          if (!result.ok) return result.error.message

          refresh()
          return null
        }}
      />

      <PatientInsuranceModal
        open={creatingPatientInsurance}
        onOpenChange={setCreatingPatientInsurance}
        patients={patients}
        plans={plans}
        isLive={isLive}
        onSubmit={async (values) => {
          const result = await createPatientInsuranceAction(values)
          if (!result.ok) return result.error.message

          refresh()
          return null
        }}
      />

      <AnswerAuthorizationModal
        key={answering?.id ?? 'sem-guia'}
        authorization={answering}
        onOpenChange={(open) => {
          if (!open) setAnswering(null)
        }}
        onSubmit={async (values) => {
          const result = await answerAuthorizationAction(values)
          if (!result.ok) return result.error.message

          setAnswering(null)
          refresh()
          return null
        }}
      />
    </div>
  )
}
