import 'server-only'

import {
  AiGatewayError,
  buildSystemPrompt,
  type AiAnswer,
  type AiAssistantGateway,
  type AiTurn,
  type ClinicFacts,
} from '../domain/AiAssistant'

/**
 * Adapter da OpenAI — Chat Completions.
 *
 * Verificado contra a API real em 12/08/2026 com `gpt-5.4-mini` e
 * `gpt-4.1-mini`: os dois respondem neste formato e devolvem `usage` com
 * `prompt_tokens` e `completion_tokens`, que é o que alimenta `ai_usage_log`.
 */

/**
 * Modelo padrão quando a clínica não escolhe.
 *
 * Um `mini` de propósito: atendimento de recepção é pergunta curta com resposta
 * curta, em volume. Pagar um modelo de raciocínio para responder "qual o
 * endereço?" é queimar orçamento no lugar errado — e a política que impede a IA
 * de inventar está no prompt e no filtro, não na capacidade do modelo.
 */
const DEFAULT_MODEL = 'gpt-5.4-mini'

/**
 * Teto de saída.
 *
 * WhatsApp de recepção é uma ou duas frases. O limite protege o custo e, de
 * quebra, o tom: resposta longa em conversa de WhatsApp já parece robô.
 */
const MAX_OUTPUT_TOKENS = 300

/** Teto de turnos do histórico enviados ao modelo. */
const MAX_HISTORY = 10

interface OpenAiCredentials {
  apiKey: string
  model?: string
}

export class OpenAiAssistantGateway implements AiAssistantGateway {
  constructor(private readonly credentials: OpenAiCredentials) {}

  async answer(input: {
    facts: ClinicFacts
    history: readonly AiTurn[]
    patientName: string | null
  }): Promise<AiAnswer> {
    const model = this.credentials.model?.trim() || DEFAULT_MODEL

    const messages = [
      {
        role: 'system' as const,
        content: buildSystemPrompt(input.facts, input.patientName),
      },
      // Só os últimos turnos: a conversa inteira cresce sem limite, e o custo
      // por mensagem cresce junto.
      ...input.history.slice(-MAX_HISTORY).map((turn) => ({
        role: turn.role,
        content: turn.text,
      })),
    ]

    let response: Response
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.credentials.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          max_completion_tokens: MAX_OUTPUT_TOKENS,
        }),
        /*
         * Teto curto: do outro lado há alguém olhando o WhatsApp. Uma resposta
         * que demora meio minuto chega depois que a pessoa já desistiu — e o
         * caminho de falha (escalar para humano) é melhor que a espera.
         */
        signal: AbortSignal.timeout(25_000),
      })
    } catch (cause) {
      throw new AiGatewayError(
        'unavailable',
        `falha de rede ao falar com a OpenAI: ${
          cause instanceof Error ? cause.name : 'desconhecida'
        }`,
      )
    }

    if (response.status === 401 || response.status === 403) {
      throw new AiGatewayError('unauthorized', 'a OpenAI recusou a chave configurada')
    }

    if (!response.ok) {
      /*
       * O corpo do erro NÃO é repassado: a OpenAI ecoa trechos do payload nas
       * mensagens, e o payload carrega a conversa do paciente.
       */
      throw new AiGatewayError('unexpected', `a OpenAI respondeu ${response.status}`)
    }

    const body = (await response.json()) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[]
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }

    const text = body.choices?.[0]?.message?.content?.trim() ?? ''

    /*
     * Resposta vazia vira ESCALONAMENTO, nunca silêncio.
     *
     * Acontece quando o modelo corta por limite ou recusa responder. Mandar
     * mensagem em branco para o paciente seria pior que não mandar nada; deixar
     * sem resposta seria pior ainda, porque ninguém ficaria sabendo.
     */
    if (text.length === 0) {
      return {
        decision: 'escalate',
        text: '',
        escalationReason: 'A IA não produziu resposta — encaminhado para a equipe.',
        model,
        inputTokens: body.usage?.prompt_tokens ?? 0,
        outputTokens: body.usage?.completion_tokens ?? 0,
      }
    }

    return {
      decision: 'reply',
      text,
      escalationReason: null,
      model,
      inputTokens: body.usage?.prompt_tokens ?? 0,
      outputTokens: body.usage?.completion_tokens ?? 0,
    }
  }
}
