'use client'

import { MailPlus, ShieldOff, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { SelectField } from '@/components/ui/select-field'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'
import { formatShortDate } from '@/lib/utils/date'

import { changeRoleAction } from '../actions/changeRole.action'
import { revokeMembershipAction } from '../actions/revokeMembership.action'
import {
  roleOptions,
  teamMessages,
  type EmployeeDto,
  type PendingInvitationDto,
  type TeamMemberDto,
  type TimeOffDto,
} from '../schemas/team.schema'
import { RevokeAccessDialog } from './RevokeAccessDialog'
import { StaffPanel } from './StaffPanel'

export interface EquipeScreenProps {
  members: readonly TeamMemberDto[]
  invitations: readonly PendingInvitationDto[]
  /** `memberships.user_id` da sessão — para a tela não oferecer auto-revogação. */
  currentUserId: string | null
  canManage: boolean
  /** Vinculo trabalhista e ausencias (S-02). */
  employees: readonly EmployeeDto[]
  timeOff: readonly TimeOffDto[]
  isLive?: boolean
}

const statusMeta: Record<string, { label: string; tone: StatusTone }> = {
  active: { label: 'Ativo', tone: 'positive' },
  invited: { label: 'Convite pendente', tone: 'pending' },
  suspended: { label: 'Suspenso', tone: 'pending' },
  revoked: { label: 'Acesso revogado', tone: 'negative' },
}

const roleLabels = new Map<string, string>(
  roleOptions.map((option) => [option.value, option.label]),
)

/**
 * Equipe — feature **S-01**.
 *
 * Substitui a tela de vitrine que vivia em `OperationsScreens.tsx`.
 *
 * # Por que o botão de convidar não existe
 *
 * Não é "em breve". `invitations` guarda `token_hash` e o schema remoto não
 * expõe RPC de criação — emitir exigiria a aplicação conhecer o algoritmo de
 * hash, e quem sabe gerar hash válido sabe forjar convite. Um botão aqui
 * produziria links que nunca seriam aceitos, e o defeito só apareceria quando
 * uma pessoa real tentasse entrar.
 *
 * A tela diz isso, em texto, no lugar onde o botão estaria. Convites que já
 * existam no banco continuam listados e continuam funcionando.
 */
export function EquipeScreen({
  members,
  invitations,
  currentUserId,
  canManage,
  employees,
  timeOff,
  isLive = false,
}: EquipeScreenProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [revoking, setRevoking] = useState<TeamMemberDto | null>(null)

  const activeMembers = members.filter((member) => member.status !== 'revoked')
  const revokedMembers = members.filter((member) => member.status === 'revoked')

  function handleRoleChange(member: TeamMemberDto, role: string) {
    setError(null)

    startTransition(async () => {
      try {
        const result = await changeRoleAction({
          membershipId: member.id,
          role,
        })

        if (!result.ok) {
          setError(result.error.message)
          return
        }

        router.refresh()
      } catch {
        setError(teamMessages.unavailable)
      }
    })
  }

  function handleRevoke(member: TeamMemberDto) {
    setError(null)

    startTransition(async () => {
      try {
        const result = await revokeMembershipAction({ membershipId: member.id })

        if (!result.ok) {
          setError(result.error.message)
          return
        }

        setRevoking(null)
        router.refresh()
      } catch {
        setError(teamMessages.unavailable)
      }
    })
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Operação da clínica"
        title="Equipe"
        description="Quem tem acesso a esta clínica e com qual perfil."
      />

      {/*
        O aviso ocupa o lugar do botão. Explica o que falta e diz que não é
        falha de quem está usando — um "em breve" faria a pessoa tentar de novo.
      */}
      {canManage ? (
        <p className="flex items-start gap-2.5 rounded-card border border-border-card bg-surface px-4 py-3 text-aux text-muted">
          <MailPlus aria-hidden className="mt-0.5 size-4 shrink-0" />
          {teamMessages.inviteUnavailable}
        </p>
      ) : null}

      {isLive ? null : (
        <p
          role="status"
          className="rounded-card border border-border-card bg-surface px-4 py-3 text-aux text-muted"
        >
          Modo demonstração: a equipe abaixo é de exemplo e nenhuma alteração é
          salva.
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

      <section aria-label="Membros com acesso" className="flex flex-col gap-3">
        <h2 className="text-body font-semibold text-foreground">
          Com acesso ({activeMembers.length})
        </h2>

        <Card className="overflow-hidden">
          {activeMembers.length === 0 ? (
            <EmptyState icon={Users} title="Nenhum membro com acesso ativo." />
          ) : (
            <ul className="flex flex-col divide-y divide-border-card">
              {activeMembers.map((member) => {
                const meta = statusMeta[member.status]
                const isSelf = member.userId === currentUserId

                return (
                  <li
                    key={member.id}
                    className="flex flex-wrap items-center gap-3 px-5 py-4"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-aux font-semibold text-foreground">
                        {member.name}
                        {isSelf ? (
                          <span className="ml-2 text-label font-normal text-muted">
                            (você)
                          </span>
                        ) : null}
                      </p>
                      {/*
                        O e-mail fica visível porque, em clínica pequena, dois
                        nomes parecidos são pessoas diferentes — e confundi-las
                        ao revogar acesso é caro.
                      */}
                      <p className="truncate text-label text-muted">
                        {member.email}
                        {member.specialties.length > 0
                          ? ` · ${member.specialties.join(', ')}`
                          : ''}
                      </p>
                    </div>

                    {meta ? (
                      <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                    ) : null}

                    {canManage && isLive ? (
                      <div className="flex items-center gap-2">
                        <SelectField
                          label="Perfil"
                          hideLabel
                          value={member.role}
                          disabled={isPending}
                          onChange={(event) =>
                            handleRoleChange(member, event.target.value)
                          }
                          options={roleOptions.map((option) => ({
                            value: option.value,
                            label: option.label,
                          }))}
                          className="w-44"
                        />

                        <Button
                          variant="secondary"
                          disabled={isPending || isSelf}
                          title={
                            isSelf
                              ? 'Você não pode revogar o seu próprio acesso.'
                              : undefined
                          }
                          onClick={() => setRevoking(member)}
                        >
                          <ShieldOff aria-hidden className="size-4" />
                          Revogar
                        </Button>
                      </div>
                    ) : (
                      <p className="text-label text-muted">
                        {roleLabels.get(member.role) ?? member.role}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </section>

      {invitations.length > 0 ? (
        <section aria-label="Convites pendentes" className="flex flex-col gap-3">
          <h2 className="text-body font-semibold text-foreground">
            Convites pendentes ({invitations.length})
          </h2>

          <Card className="overflow-hidden">
            <ul className="flex flex-col divide-y divide-border-card">
              {invitations.map((invitation) => (
                <li
                  key={invitation.id}
                  className="flex flex-wrap items-center gap-3 px-5 py-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-aux font-semibold text-foreground">
                      {invitation.email}
                    </p>
                    <p className="text-label text-muted">
                      {roleLabels.get(invitation.role) ?? invitation.role} ·
                      expira em{' '}
                      {formatShortDate(new Date(invitation.expiresAt))}
                    </p>
                  </div>
                  <StatusBadge tone="pending">Aguardando aceite</StatusBadge>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      {revokedMembers.length > 0 ? (
        <section aria-label="Acessos revogados" className="flex flex-col gap-3">
          <h2 className="text-body font-semibold text-foreground">
            Acessos revogados ({revokedMembers.length})
          </h2>

          {/*
            Revogados continuam na tela porque continuam na base: quem teve
            acesso a dado de saúde, e até quando, é informação que a clínica
            precisa conseguir consultar.
          */}
          <Card className="overflow-hidden">
            <ul className="flex flex-col divide-y divide-border-card">
              {revokedMembers.map((member) => (
                <li
                  key={member.id}
                  className="flex flex-wrap items-center gap-3 px-5 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-aux text-foreground">
                      {member.name}
                    </p>
                    <p className="truncate text-label text-muted">
                      {member.email}
                    </p>
                  </div>
                  <StatusBadge tone="negative">Acesso revogado</StatusBadge>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ) : null}

      {/*
        Funcionários e ausências (S-02).
        S-01 dizia que dependiam de `employees`, "entidade que o produto não
        modela" — modela agora, no mínimo necessário. A escala continua fora, e
        o painel explica por quê.
      */}
      <StaffPanel
        employees={employees}
        timeOff={timeOff}
        canManage={canManage}
        isLive={isLive}
      />

      <RevokeAccessDialog
        member={revoking}
        isPending={isPending}
        onOpenChange={(open) => {
          if (!open) setRevoking(null)
        }}
        onConfirm={handleRevoke}
      />
    </div>
  )
}
