import { PlugZap } from 'lucide-react'
import type { ReactNode } from 'react'

import { Card } from '@/components/ui/card'
import { StatusBadge, type StatusTone } from '@/components/ui/status-badge'

import type { ConnectionState } from '../domain/Integration'

export interface IntegrationStatusCardProps {
  title: string
  /** O que a integração faria, em uma frase. */
  purpose: string
  state: ConnectionState
  /**
   * O que falta, em texto claro.
   *
   * Não é "em breve": é o que precisa acontecer, e por quem. Uma clínica que lê
   * "depende de um serviço externo que a equipe técnica ainda não contratou"
   * sabe a quem perguntar; uma que lê "em breve" fica esperando.
   */
  blockedBy: string
  children?: ReactNode
}

const stateMeta: Record<
  ConnectionState,
  { label: string; tone: StatusTone }
> = {
  absent: { label: 'Não configurado', tone: 'negative' },
  inactive: { label: 'Configurado, desligado', tone: 'pending' },
  connected: { label: 'Conectado', tone: 'positive' },
}

/**
 * O cartão de estado de uma integração.
 *
 * Substitui as três telas de vitrine — conversas de WhatsApp, respostas de IA e
 * regras de automação, todas escritas no arquivo. Quem abria `/whatsapp` via um
 * inbox com mensagens e concluía que o canal da clínica estava ligado; nenhuma
 * mensagem sairia dali nunca.
 */
export function IntegrationStatusCard({
  title,
  purpose,
  state,
  blockedBy,
  children,
}: IntegrationStatusCardProps) {
  const meta = stateMeta[state]

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <h2 className="text-card-title font-semibold text-foreground">
            {title}
          </h2>
          <p className="mt-1 max-w-xl text-aux leading-6 text-muted">
            {purpose}
          </p>
        </div>
        <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
      </div>

      {state !== 'connected' ? (
        <p className="mx-5 mt-4 flex items-start gap-2.5 rounded-card border border-border-card bg-background px-4 py-3 text-aux text-muted">
          <PlugZap aria-hidden className="mt-0.5 size-4 shrink-0" />
          {blockedBy}
        </p>
      ) : null}

      {children ? <div className="px-5 pt-4">{children}</div> : null}

      <div className="h-5" />
    </Card>
  )
}
