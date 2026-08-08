import { Info, ShieldCheck } from 'lucide-react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'

import type { AiStatus } from '../domain/Integration'
import { IntegrationStatusCard } from './IntegrationStatusCard'

export interface ChatIaScreenProps {
  status: AiStatus
}

/**
 * Chat IA — estado, feature **AI-01..07** (bloqueada).
 *
 * Substitui a vitrine que mostrava uma conversa pronta com a IA. O problema
 * daquela tela não era só ser falsa: uma resposta de IA escrita no arquivo, ao
 * lado de dado de paciente, ensina que a IA já tem acesso ao prontuário. Ela
 * não tem, e o desenho de quando terá é o que está em aprovação.
 *
 * # A regra que precisa existir ANTES do recurso
 *
 * P9 do roadmap: **IA sugere, humano assina**. Nada gerado por modelo entra em
 * prontuário nem é enviado a paciente sem confirmação de uma pessoa. Esta tela
 * declara a regra enquanto o recurso não existe, para que ele nasça dentro dela
 * em vez de precisar ser contido depois.
 */
export function ChatIaScreen({ status }: ChatIaScreenProps) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Inteligência"
        title="Assistente com IA"
        description="O que a clínica poderá delegar, e o que nunca será delegado."
      />

      <IntegrationStatusCard
        title="Assistente"
        purpose="Responder dúvidas da equipe sobre a própria clínica e preparar rascunhos de mensagem ao paciente."
        state={status.enabled ? 'inactive' : 'absent'}
        blockedBy="Nenhum provedor de IA está configurado, e nenhuma chamada sai deste código. O recurso depende da aprovação do desenho em docs/04-agente-ia.md antes de qualquer implementação."
      />

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-subtle text-link">
            <ShieldCheck aria-hidden className="size-4" />
          </span>
          <div>
            <h2 className="text-control font-semibold text-foreground">
              IA sugere, humano assina
            </h2>
            <p className="mt-1 max-w-2xl text-aux leading-6 text-muted">
              Esta é a regra do produto, e ela vale desde antes de o recurso
              existir: nada gerado por um modelo entra em prontuário nem é
              enviado a um paciente sem que uma pessoa confirme. Quando o
              assistente chegar, ele vai propor — quem responde pelo cuidado
              continua sendo quem decide.
            </p>
          </div>
        </div>
      </Card>

      <section aria-label="Uso registrado" className="grid gap-4 sm:grid-cols-2">
        <Counter label="Conversas com o assistente" value={status.conversations} />
        <Counter label="Requisições registradas" value={status.requests} />
      </section>

      <p className="flex items-start gap-2.5 text-label text-muted">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        Os números são contados no banco e valem zero: nenhuma chamada a modelo
        de IA parte deste sistema hoje. Eles existem para que, no dia em que
        partir, o consumo apareça desde a primeira.
      </p>
    </div>
  )
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-card border border-border-card bg-surface px-5 py-4">
      <p className="text-label text-muted">{label}</p>
      <p className="mt-1 text-metric font-semibold text-foreground">{value}</p>
    </div>
  )
}
