import { Info, MessagesSquare, ShieldCheck } from 'lucide-react'
import Link from 'next/link'

import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'

import type { AiStatus } from '../domain/Integration'
import { IntegrationStatusCard } from './IntegrationStatusCard'

export interface ChatIaScreenProps {
  status: AiStatus
  /**
   * O atendimento automático do WhatsApp está ligado?
   *
   * Esta tela é sobre o assistente INTERNO, que não existe. Mas desde
   * 12/08/2026 existe IA no produto, em outra tela — e uma página que diz "nada
   * usa IA aqui" enquanto a clínica vê respostas automáticas saindo perde a
   * credibilidade de tudo o mais que ela afirma.
   */
  whatsappAiEnabled?: boolean
}

/**
 * Assistente com IA — o estado do que NÃO existe, e o limite do que existe.
 *
 * Substitui a vitrine que mostrava uma conversa pronta com a IA. O problema
 * daquela tela não era só ser falsa: uma resposta de IA escrita no arquivo, ao
 * lado de dado de paciente, ensina que a IA já tem acesso ao prontuário.
 *
 * # A regra do produto, reconciliada com o que foi construído
 *
 * P9 dizia, sem qualificação: **IA sugere, humano assina**. Em 12/08/2026 o
 * atendimento no WhatsApp passou a responder paciente SEM revisão humana — e
 * essa é, honestamente, uma exceção à regra como estava escrita.
 *
 * A regra não foi abandonada; foi delimitada, e o limite é o assunto:
 *
 *  - **Conteúdo clínico e prontuário** continuam sob P9 integralmente. Nada
 *    gerado por modelo entra em prontuário, e a IA não responde sobre sintoma,
 *    remédio, exame ou resultado — encaminha.
 *  - **Logística de recepção** (horário, endereço, convênio) a IA responde
 *    sozinha, para paciente já cadastrado, sem afirmar nada fora dos fatos que
 *    recebe.
 *
 * Esta tela declara as duas coisas porque a diferença é o produto inteiro: uma
 * clínica precisa saber exatamente onde a máquina fala por ela.
 */
export function ChatIaScreen({ status, whatsappAiEnabled = false }: ChatIaScreenProps) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Inteligência"
        title="Assistente com IA"
        description="O que a clínica delega hoje, e o que nunca será delegado."
      />

      {/*
        O que JÁ existe vem primeiro. Enterrar isto no rodapé faria a tela
        parecer desatualizada para quem acabou de ver a IA responder no WhatsApp.
      */}
      <Card className="flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <MessagesSquare aria-hidden className="mt-0.5 size-5 shrink-0 text-muted" />
            <div>
              <h2 className="text-control font-semibold text-foreground">
                Atendimento automático no WhatsApp
              </h2>
              <p className="mt-1 max-w-2xl text-aux leading-6 text-muted">
                Este é o único lugar do produto onde a IA fala com paciente. Ela
                responde dúvidas simples de quem já tem cadastro — horário,
                endereço, convênio — e encaminha para a equipe qualquer assunto
                clínico ou urgência.
              </p>
            </div>
          </div>

          <StatusBadge tone={whatsappAiEnabled ? 'positive' : 'neutral'}>
            {whatsappAiEnabled ? 'Ligado' : 'Desligado'}
          </StatusBadge>
        </div>

        <p className="text-label text-muted">
          O controle fica em{' '}
          <Link href="/whatsapp" className="text-link hover:underline">
            WhatsApp
          </Link>
          , junto da conexão do aparelho.
        </p>
      </Card>

      <IntegrationStatusCard
        title="Assistente interno da equipe"
        purpose="Responder dúvidas da equipe sobre a própria clínica e preparar rascunhos a partir de dados internos."
        state="absent"
        blockedBy="Não existe. Diferente do atendimento no WhatsApp, este assistente leria dados internos da clínica para responder a equipe — e o desenho de quais dados, com qual isolamento, está em docs/04-agente-ia.md, sem aprovação."
      />

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-subtle text-link">
            <ShieldCheck aria-hidden className="size-4" />
          </span>
          <div>
            <h2 className="text-control font-semibold text-foreground">
              O que a IA nunca faz sozinha
            </h2>
            <p className="mt-1 max-w-2xl text-aux leading-6 text-muted">
              Nada gerado por um modelo entra em prontuário. A IA não dá
              orientação clínica, não interpreta exame, não indica remédio nem
              dose, e não marca, remarca ou cancela consulta. Onde há decisão de
              cuidado, quem responde por ela é uma pessoa — e a regra vale desde
              antes de existir qualquer IA neste produto.
            </p>
            <p className="mt-2 max-w-2xl text-aux leading-6 text-muted">
              O que a IA faz sem revisão é responder informação operacional que a
              clínica já publicaria num cartaz na recepção, para quem já é
              paciente.
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
        Os números contam o consumo real, por clínica. O custo em reais não
        aparece aqui: a API devolve tokens, não valor — converter exigiria uma
        tabela de preço por modelo, e um número que não bate com a fatura seria
        pior que nenhum.
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
