'use client'

import { Bot, ShieldCheck } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'

export interface AiAssistantPanelProps {
  /** Estado atual de `clinic_settings.ai_enabled`, lido pela rota. */
  enabled: boolean
  /** Há credencial da OpenAI no cofre desta clínica? */
  hasCredential: boolean
  /**
   * Liga/desliga — injetado pela ROTA.
   *
   * A preferência mora em `settings`, e a regra 4 impede este módulo de alcançar
   * a action de lá. Não é cerimônia: é o que mantém `integrations` sem
   * conhecimento de como `settings` guarda as coisas — mesmo padrão de
   * `MessageTemplatesPanel`.
   *
   * Devolve a mensagem de erro, ou `null` quando deu certo.
   */
  onToggle: (enabled: boolean) => Promise<{ enabled: boolean } | string>
  canManage: boolean
  isLive?: boolean
}

/**
 * O interruptor da IA que responde paciente.
 *
 * # Por que ele é um botão explícito, e não um switch discreto
 *
 * Ligar isto faz uma máquina responder, sozinha, quem escreve para a clínica.
 * Um controle que se liga sem querer, no meio de uma lista de preferências, é
 * desproporcional ao que ele decide — e quem desliga costuma estar com pressa,
 * porque algo saiu errado.
 *
 * O painel também **diz o que a IA faz e o que ela não faz**. Sem isso, a
 * expectativa de quem liga é a de um atendente completo, e a primeira resposta
 * "vou confirmar com a equipe" parece defeito em vez de política.
 */
export function AiAssistantPanel({
  enabled,
  hasCredential,
  onToggle,
  canManage,
  isLive = false,
}: AiAssistantPanelProps) {
  const [isOn, setOn] = useState(enabled)
  const [isWorking, setWorking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function toggle() {
    setWorking(true)
    setError(null)

    try {
      const result = await onToggle(!isOn)

      if (typeof result === 'string') {
        setError(result)
        return
      }

      // O que voltou do servidor, não o que foi pedido: numa configuração que
      // decide se uma máquina fala com paciente, a tela mostra o que está
      // valendo.
      setOn(result.enabled)
    } catch {
      setError('Não foi possível alterar agora. Tente novamente.')
    } finally {
      setWorking(false)
    }
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <Bot aria-hidden className="mt-0.5 size-5 shrink-0 text-muted" />
          <div>
            <h2 className="text-aux font-semibold text-foreground">
              Atendimento automático
            </h2>
            <p className="mt-1 text-label text-muted">
              Responde dúvidas simples de quem já é paciente, no WhatsApp.
            </p>
          </div>
        </div>

        <StatusBadge tone={isOn ? 'positive' : 'neutral'}>
          {isOn ? 'Ligado' : 'Desligado'}
        </StatusBadge>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-field border border-danger/30 bg-danger-surface px-3.5 py-2.5 text-aux text-danger"
        >
          {error}
        </p>
      ) : null}

      {/*
        O que a IA NÃO faz vem antes do botão, e não escondido num rodapé: é a
        informação que impede alguém de ligar esperando outra coisa.
      */}
      <div className="rounded-field border border-border-card bg-background px-3.5 py-3">
        <p className="flex items-center gap-2 text-label font-semibold text-foreground">
          <ShieldCheck aria-hidden className="size-4 text-muted" />
          Limites de segurança, sempre ativos
        </p>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-label text-muted">
          <li>
            Nunca responde sobre sintoma, remédio, exame ou resultado — encaminha
            para a equipe.
          </li>
          <li>Nunca marca, remarca ou cancela consulta.</li>
          <li>Nunca inventa horário ou preço: confirma com a equipe.</li>
          <li>Só responde contato com cadastro de paciente.</li>
          <li>Mensagem urgente vai direto para atendimento humano.</li>
        </ul>
      </div>

      {!hasCredential ? (
        <p className="rounded-field border border-border-card bg-background px-3.5 py-2.5 text-aux text-muted">
          Cadastre a chave da OpenAI em Configurações → Integrações para poder
          ligar o atendimento automático.
        </p>
      ) : null}

      {!canManage ? (
        <p className="rounded-field border border-border-card bg-background px-3.5 py-2.5 text-label text-muted">
          Seu perfil vê o estado, mas não altera. Ligar a IA muda quem responde
          pela clínica.
        </p>
      ) : (
        <div>
          <Button
            variant={isOn ? 'secondary' : 'primary'}
            onClick={toggle}
            isLoading={isWorking}
            disabled={!isLive || (!hasCredential && !isOn)}
            title={
              isLive ? undefined : 'Modo demonstração: exige banco configurado.'
            }
          >
            {isOn ? 'Desligar atendimento automático' : 'Ligar atendimento automático'}
          </Button>
        </div>
      )}
    </Card>
  )
}
