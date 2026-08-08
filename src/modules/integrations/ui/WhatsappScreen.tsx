import { Info } from 'lucide-react'

import { PageHeader } from '@/components/layout/PageHeader'

import type { WhatsappStatus } from '../domain/Integration'
import { IntegrationStatusCard } from './IntegrationStatusCard'

export interface WhatsappScreenProps {
  status: WhatsappStatus
}

/** '5511999998888' -> '•••• 8888'. O número inteiro não precisa aparecer. */
function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : '••••'
}

/**
 * WhatsApp — estado de conexão, feature **W-01** (bloqueada).
 *
 * Substitui a vitrine que mostrava conversas escritas no arquivo. Quem a abria
 * via um inbox com mensagens e concluía que o WhatsApp da clínica estava
 * ligado — e nenhuma mensagem sairia dali nunca.
 *
 * Esta tela lê `whatsapp_channels` do banco e diz o que encontrou. Quando W-01
 * chegar, o inbox nasce por cima de uma base que já sabe distinguir "sem canal"
 * de "canal cadastrado e desligado".
 */
export function WhatsappScreen({ status }: WhatsappScreenProps) {
  const channel = status.channel

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Relacionamento"
        title="WhatsApp"
        description="O canal da clínica com o paciente."
      />

      <IntegrationStatusCard
        title="Canal de WhatsApp"
        purpose="Confirmar consulta, lembrar do horário e responder o paciente sem tirar alguém da recepção."
        state={channel?.state ?? 'absent'}
        blockedBy={
          channel
            ? 'O canal está cadastrado, mas não há conexão ativa. Ligar exige um provedor contratado e o serviço de envio em execução — nenhum dos dois existe neste ambiente.'
            : 'Nenhum canal cadastrado. O envio depende de um provedor de WhatsApp e de um serviço de fila que ainda não fazem parte desta instalação — ver EXTERNAL_SETUP.md.'
        }
      >
        {channel ? (
          <dl className="grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-label text-muted">Nome</dt>
              <dd className="mt-1 text-aux font-semibold text-foreground">
                {channel.displayName}
              </dd>
            </div>
            <div>
              <dt className="text-label text-muted">Número</dt>
              {/*
                Mascarado: o número completo é dado de contato da clínica e não
                acrescenta nada a quem só quer saber se está conectado.
              */}
              <dd className="mt-1 text-aux font-semibold text-foreground">
                {maskPhone(channel.phoneNumber)}
              </dd>
            </div>
            <div>
              <dt className="text-label text-muted">Provedor</dt>
              <dd className="mt-1 text-aux font-semibold text-foreground">
                {channel.provider}
              </dd>
            </div>
          </dl>
        ) : null}
      </IntegrationStatusCard>

      <section aria-label="O que já existe no banco" className="grid gap-4 sm:grid-cols-3">
        <Counter label="Conversas" value={status.conversations} />
        <Counter label="Mensagens" value={status.messages} />
        <Counter label="Modelos de mensagem" value={status.templates} />
      </section>

      <p className="flex items-start gap-2.5 text-label text-muted">
        <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        Os números acima são contados no banco. São zero porque nenhuma parte do
        sistema escreve nessas tabelas ainda — não porque a clínica não conversa
        com seus pacientes.
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
