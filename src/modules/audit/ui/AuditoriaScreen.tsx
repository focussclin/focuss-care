import { ClipboardList, Info } from 'lucide-react'
import Link from 'next/link'

import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { SelectField } from '@/components/ui/select-field'
import { TextField } from '@/components/ui/text-field'
import { describeRole } from '@/lib/auth/session'
import { formatShortDate, formatTime } from '@/lib/utils/date'

import type { AuditLogDto } from '../application/toAuditLogDto'

export interface AuditoriaScreenProps {
  entries: readonly AuditLogDto[]
  hasMore: boolean
  page: number
  action: string | null
  entityType: string | null
  isLive: boolean
}

const actionOptions = [
  { value: '', label: 'Todas as ações' },
  /*
   * A leitura de dado clínico abre a lista, e não é ordem alfabética.
   *
   * É o evento pelo qual esta tela é procurada: "quem abriu o prontuário desta
   * paciente" é a pergunta que uma investigação faz, e ela era a única sem
   * atalho — dava para chegar nela digitando `record.read` no campo de ação
   * personalizada, o que exige saber o nome do verbo de antemão.
   */
  { value: 'record.read', label: 'Dado clínico lido' },
  { value: 'record.created', label: 'Registro de prontuário criado' },
  { value: 'record.amended', label: 'Registro de prontuário corrigido' },
  { value: 'patient.created', label: 'Paciente criado' },
  { value: 'patient.updated', label: 'Paciente atualizado' },
  { value: 'patient.archived', label: 'Paciente arquivado' },
  { value: 'appointment.created', label: 'Atendimento agendado' },
  { value: 'appointment.canceled', label: 'Atendimento cancelado' },
  { value: 'notification.read', label: 'Notificação lida' },
  { value: 'notification.read-all', label: 'Notificações lidas em lote' },
]

const entityOptions = [
  { value: '', label: 'Todas as entidades' },
  { value: 'patient', label: 'Paciente' },
  { value: 'medical_record', label: 'Registro de prontuário' },
  { value: 'appointment', label: 'Agendamento' },
  { value: 'notification', label: 'Notificação' },
  { value: 'patient_contact', label: 'Contato de paciente' },
]

export function AuditoriaScreen({
  entries,
  hasMore,
  page,
  action,
  entityType,
  isLive,
}: AuditoriaScreenProps) {
  const previousHref = buildHref(action, entityType, Math.max(page - 1, 1))
  const nextHref = buildHref(action, entityType, page + 1)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Governança"
        title="Auditoria"
        description="Trilha imutável das ações relevantes realizadas nesta clínica."
      />

      {isLive ? null : (
        <p role="status" className="rounded-card border border-border-card bg-surface px-4 py-3 text-aux text-muted">
          Modo demonstração: a auditoria real aparece quando o banco estiver conectado.
          Nenhum evento fictício é exibido.
        </p>
      )}

      <Card>
        <CardHeader
          title="Filtrar eventos"
          description="Os filtros são aplicados no servidor e respeitam a clínica ativa."
        />
        <form method="get" className="grid gap-4 px-5 pb-5 nav:grid-cols-[1fr_1fr_1.2fr_auto] nav:items-end">
          <SelectField
            label="Ação"
            name="action"
            defaultValue={action ?? ''}
            options={actionOptions}
          />
          <SelectField
            label="Entidade"
            name="entityType"
            defaultValue={entityType ?? ''}
            options={entityOptions}
          />
          <TextField
            label="Ação personalizada"
            name="action_custom"
            placeholder="Ex.: team.role.changed"
            defaultValue={action && !actionOptions.some((option) => option.value === action) ? action : ''}
          />
          <Button type="submit">Aplicar filtros</Button>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader
          title="Eventos recentes"
          description={entries.length > 0 ? `Página ${page}` : 'Nenhum evento para este recorte.'}
        />

        {entries.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="Nenhum evento encontrado."
            description={isLive ? 'Novas ações relevantes aparecerão nesta trilha.' : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left">
              <thead>
                <tr className="border-t border-border-card bg-background text-label font-semibold text-muted">
                  <th className="px-5 py-3">Data e hora</th>
                  <th className="px-5 py-3">Ação</th>
                  <th className="px-5 py-3">Entidade</th>
                  <th className="px-5 py-3">Papel</th>
                  <th className="px-5 py-3">Referência</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-t border-border-card align-top">
                    <td className="whitespace-nowrap px-5 py-3.5 text-label text-muted">
                      {formatShortDate(new Date(entry.occurredAt))} ·{' '}
                      {formatTime(new Date(entry.occurredAt))}
                    </td>
                    <td className="px-5 py-3.5 text-aux font-semibold text-foreground">
                      {entry.action}
                    </td>
                    <td className="px-5 py-3.5 text-label text-muted">
                      {entry.entityType}
                    </td>
                    <td className="px-5 py-3.5 text-label text-muted">
                      {entry.actorRole ? describeRole(entry.actorRole) : 'Sistema'}
                    </td>
                    <td className="px-5 py-3.5 font-mono text-label text-muted">
                      {entry.entityId ? opaqueId(entry.entityId) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {entries.length > 0 ? (
          <nav aria-label="Paginação da auditoria" className="flex items-center justify-between border-t border-border-card px-5 py-3">
            {page > 1 ? <Button asChild variant="secondary"><Link href={previousHref}>Anterior</Link></Button> : <span />}
            {hasMore ? <Button asChild variant="secondary"><Link href={nextHref}>Próxima</Link></Button> : <span />}
          </nav>
        ) : null}
      </Card>

      <p className="flex items-start gap-2.5 text-label text-muted">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        IP, user-agent, conteúdo clínico e metadados brutos não são exibidos nesta
        listagem. A trilha original permanece append-only no banco.
      </p>
    </div>
  )
}

function buildHref(action: string | null, entityType: string | null, page: number) {
  const params = new URLSearchParams()
  if (action) params.set('action', action)
  if (entityType) params.set('entityType', entityType)
  params.set('page', String(page))
  return `/auditoria?${params.toString()}`
}

function opaqueId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value
}
