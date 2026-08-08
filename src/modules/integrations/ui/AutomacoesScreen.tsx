import { Info, Workflow } from 'lucide-react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { StatusBadge } from '@/components/ui/status-badge'
import { formatShortDate } from '@/lib/utils/date'

import type { AutomationStatus } from '../domain/Integration'
import { IntegrationStatusCard } from './IntegrationStatusCard'

export interface AutomacoesScreenProps {
  status: AutomationStatus
}

/**
 * Automações — estado, feature **AU-01** (bloqueada).
 *
 * Substitui a vitrine que trazia duas regras ativas, "184 execuções este mês" e
 * um interruptor que ligava e desligava estado local. Aquele interruptor era o
 * pior detalhe: ele funcionava — mudava de posição, mostrava "ativa" — e não
 * ligava nada. Uma clínica confiaria que o lembrete de consulta estava saindo.
 *
 * Aqui as regras vêm de `workflows`, no banco, e a tela diz que **nada as
 * executa**: não há worker, e AU-01 depende de W-01.
 */
export function AutomacoesScreen({ status }: AutomacoesScreenProps) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Produtividade"
        title="Automações"
        description="Regras que a clínica pode cadastrar, e o que ainda falta para executá-las."
      />

      <IntegrationStatusCard
        title="Execução de automações"
        purpose="Disparar lembrete de consulta, pedido de confirmação e recuperação de paciente sem alguém lembrar de fazer."
        state="absent"
        blockedBy="Não há serviço de execução instalado. Uma regra cadastrada fica guardada e não dispara — a execução depende do mesmo serviço de fila que o WhatsApp precisa."
      />

      <Card className="overflow-hidden">
        <div className="px-5 pt-5">
          <h2 className="text-card-title font-semibold text-foreground">
            Regras cadastradas
          </h2>
          <p className="mt-1 text-aux text-muted">
            Lidas de `workflows`. Nenhuma é executada hoje.
          </p>
        </div>

        {status.rules.length === 0 ? (
          <EmptyState
            icon={Workflow}
            title="Nenhuma regra cadastrada."
            description="O cadastro entra junto com o serviço que vai executá-las — uma regra que não dispara não ajuda ninguém."
          />
        ) : (
          <ul className="mt-4 divide-y divide-border-card border-t border-border-card">
            {status.rules.map((rule) => (
              <li
                key={rule.id}
                className="flex flex-wrap items-center gap-3 px-5 py-3.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-aux font-semibold text-foreground">
                    {rule.name}
                  </p>
                  <p className="truncate text-label text-muted">
                    Gatilho: {rule.triggerType}
                    {rule.lastRunAt
                      ? ` · última execução ${formatShortDate(rule.lastRunAt)}`
                      : ' · nunca executada'}
                  </p>
                </div>

                {/*
                  `is_active` é o que está no banco — não uma promessa de que a
                  regra dispara. Sem executor, "ativa" significa apenas
                  "marcada para quando houver".
                */}
                <StatusBadge tone={rule.isActive ? 'pending' : 'negative'}>
                  {rule.isActive ? 'Marcada como ativa' : 'Desligada'}
                </StatusBadge>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="flex items-start gap-2.5 text-label text-muted">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        {status.runs === 0
          ? 'Nenhuma execução registrada — e não haveria como haver: o serviço que executaria as regras não faz parte desta instalação.'
          : `${status.runs} execuções registradas em workflow_runs.`}
      </p>
    </div>
  )
}
