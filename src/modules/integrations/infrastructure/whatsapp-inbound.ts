import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import {
  formatClinicAddress,
  parseStoredClinicAddress,
} from '@/lib/clinic/address'
import {
  describeBusinessHours,
  parseStoredBusinessHours,
} from '@/lib/clinic/business-hours'
import type { Database } from '@/lib/supabase/database.types'

import {
  checkEscalation,
  isAiGatewayError,
  type AiTurn,
  type ClinicFacts,
} from '../domain/AiAssistant'
import { aiAssistantGatewayFor } from './ai-assistant-gateway'
import { whatsappGatewayFor } from './whatsapp-gateway'

/**
 * O que acontece quando um paciente escreve no WhatsApp da clínica.
 *
 * # Por que isto vive em `infrastructure/`, e não em `application/`
 *
 * A regra 2 da arquitetura é clara: caso de uso só conhece a porta do domínio.
 * Este arquivo lê e escreve `conversations`, `messages` e `ai_usage_log`
 * diretamente, então é infraestrutura — chamá-lo de caso de uso e deixá-lo em
 * `application/` seria manter a pasta certa com o conteúdo errado, que é a
 * forma mais silenciosa de a arquitetura apodrecer.
 *
 * Promovê-lo a caso de uso de verdade exige portas para conversa e mensagem, e
 * é trabalho que só se paga quando um segundo provedor entrar (`zapi`,
 * `cloud_api`). Enquanto houver um, a porta seria cerimônia.
 *
 * # A ordem dos freios importa
 *
 *  1. **Conversa registrada** — antes de qualquer IA. Se tudo abaixo falhar, a
 *     mensagem do paciente está no inbox e uma pessoa vê.
 *  2. **Filtro local de escalonamento** — assunto clínico ou urgência nem chega
 *     ao modelo. É regra, não pedido: não depende de o modelo obedecer.
 *  3. **IA desligada por conversa** — `conversations.is_ai_handled` é o
 *     interruptor. Uma conversa que a recepção assumiu não volta para a máquina.
 *  4. **Só contato com paciente vinculado** — número desconhecido vai para
 *     humano. Limita o dano de quem sonda o que a clínica responde, e soltar
 *     depois é uma linha; recolher depois de um incidente é outra conversa.
 *
 * Nada aqui devolve erro ao provedor: o webhook responde 200 sempre. Erro faz a
 * Evolution reenviar, e reenvio vira mensagem duplicada para o paciente.
 */

export interface IncomingMessage {
  clinicId: string
  instanceName: string
  /** Só dígitos. */
  fromPhone: string
  contactName: string | null
  text: string
  providerMessageId: string | null
}

export type IncomingOutcome =
  | 'replied'
  | 'escalated'
  /** `clinic_settings.ai_enabled` está desligado para a clínica inteira. */
  | 'ignored-ai-disabled'
  | 'ignored-ai-off'
  | 'ignored-unknown-contact'
  | 'failed'

export async function handleIncomingWhatsapp(
  client: SupabaseClient<Database>,
  incoming: IncomingMessage,
): Promise<IncomingOutcome> {
  const conversation = await upsertConversation(client, incoming)
  if (!conversation) return 'failed'

  await recordInbound(client, incoming, conversation.id)

  // 2. Filtro local — antes de gastar token e sem depender do modelo.
  const escalation = checkEscalation(incoming.text)
  if (escalation.shouldEscalate) {
    await escalate(client, incoming.clinicId, conversation.id, escalation.reason)
    return 'escalated'
  }

  /*
   * 3. O interruptor da CLÍNICA, antes do interruptor da conversa.
   *
   * `clinic_settings.ai_enabled` já existia no schema e não estava sendo lido —
   * uma clínica que desligasse a IA nas configurações continuaria tendo respostas
   * automáticas enviadas em seu nome. É a trava mais externa que existe: sem
   * ela, o único jeito de calar a IA seria apagar a credencial da OpenAI.
   *
   * Ausência de linha em `clinic_settings` conta como DESLIGADO: uma clínica que
   * nunca abriu as configurações não pediu para uma máquina falar com seus
   * pacientes.
   */
  if (!(await isAiEnabled(client, incoming.clinicId))) {
    await escalate(
      client,
      incoming.clinicId,
      conversation.id,
      'IA desligada nas configurações da clínica.',
    )
    return 'ignored-ai-disabled'
  }

  // 4. A recepção assumiu esta conversa.
  if (!conversation.isAiHandled) return 'ignored-ai-off'

  // 5. Contato sem paciente vinculado.
  if (!conversation.patientId) {
    await escalate(
      client,
      incoming.clinicId,
      conversation.id,
      'Contato sem cadastro de paciente — atendimento humano.',
    )
    return 'ignored-unknown-contact'
  }

  try {
    const [facts, history, gateway, whatsapp] = await Promise.all([
      loadClinicFacts(client, incoming.clinicId),
      loadHistory(client, conversation.id),
      aiAssistantGatewayFor(client, incoming.clinicId),
      whatsappGatewayFor(client, incoming.clinicId),
    ])

    const answer = await gateway.answer({
      facts,
      history: [...history, { role: 'user', text: incoming.text }],
      patientName: conversation.contactName,
    })

    await logUsage(client, incoming.clinicId, answer)

    if (answer.decision === 'escalate') {
      await escalate(client, incoming.clinicId, conversation.id, answer.escalationReason)
      return 'escalated'
    }

    const sent = await whatsapp.sendText(
      incoming.instanceName,
      incoming.fromPhone,
      answer.text,
    )

    await recordOutbound(client, {
      clinicId: incoming.clinicId,
      conversationId: conversation.id,
      text: answer.text,
      providerMessageId: sent.providerMessageId,
    })

    return 'replied'
  } catch (cause) {
    /*
     * Qualquer falha vira ESCALONAMENTO, nunca silêncio.
     *
     * A mensagem do paciente já está registrada; o que muda é a conversa passar
     * para a fila humana com o motivo. Ficar quieto seria a única saída pior que
     * responder errado.
     */
    console.error('[whatsapp-ai] falha ao responder', {
      reason: isAiGatewayError(cause) ? cause.reason : 'desconhecida',
      kind: cause instanceof Error ? cause.name : typeof cause,
    })

    await escalate(
      client,
      incoming.clinicId,
      conversation.id,
      'Falha técnica ao gerar resposta — atendimento humano.',
    )

    return 'failed'
  }
}

interface ConversationRef {
  id: string
  patientId: string | null
  contactName: string | null
  isAiHandled: boolean
}

async function upsertConversation(
  client: SupabaseClient<Database>,
  incoming: IncomingMessage,
): Promise<ConversationRef | null> {
  const { data: existing } = await client
    .from('conversations')
    .select('id, patient_id, contact_name, is_ai_handled')
    .eq('clinic_id', incoming.clinicId)
    .eq('contact_phone', incoming.fromPhone)
    .maybeSingle()

  if (existing) {
    await client
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
        unread_count: 1,
      })
      .eq('id', existing.id)

    return {
      id: existing.id,
      patientId: existing.patient_id,
      contactName: existing.contact_name,
      isAiHandled: existing.is_ai_handled,
    }
  }

  /*
   * Conversa nova nasce com o paciente já vinculado quando o telefone bate.
   *
   * É o que permite a IA responder quem já é da casa sem ninguém ligar os dois à
   * mão — e é também o que mantém a regra 4 barata: sem paciente, vai para
   * humano.
   */
  const { data: patient } = await client
    .from('patients')
    .select('id, full_name')
    .eq('clinic_id', incoming.clinicId)
    .or(`phone.eq.${incoming.fromPhone},phone_alt.eq.${incoming.fromPhone}`)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()

  const { data: created, error } = await client
    .from('conversations')
    .insert({
      clinic_id: incoming.clinicId,
      contact_phone: incoming.fromPhone,
      contact_name: patient?.full_name ?? incoming.contactName,
      patient_id: patient?.id ?? null,
      status: 'open',
      // Nasce com IA ligada; a recepção desliga ao assumir.
      is_ai_handled: true,
      last_message_at: new Date().toISOString(),
      unread_count: 1,
    })
    .select('id, patient_id, contact_name, is_ai_handled')
    .single()

  if (error || !created) {
    console.error('[whatsapp-ai] nao foi possivel abrir a conversa', {
      code: error?.code ?? null,
    })
    return null
  }

  return {
    id: created.id,
    patientId: created.patient_id,
    contactName: created.contact_name,
    isAiHandled: created.is_ai_handled,
  }
}

async function recordInbound(
  client: SupabaseClient<Database>,
  incoming: IncomingMessage,
  conversationId: string,
): Promise<void> {
  await client.from('messages').insert({
    clinic_id: incoming.clinicId,
    conversation_id: conversationId,
    direction: 'inbound',
    content_type: 'text',
    body: incoming.text,
    provider_message_id: incoming.providerMessageId,
    // `delivered`: chegou até a clínica. `read` é ato de quem lê, e ninguém
    // leu ainda — a recepção é que marca isso ao abrir a conversa.
    status: 'delivered',
    is_from_ai: false,
    sent_at: new Date().toISOString(),
  })
}

async function recordOutbound(
  client: SupabaseClient<Database>,
  data: {
    clinicId: string
    conversationId: string
    text: string
    providerMessageId: string | null
  },
): Promise<void> {
  await client.from('messages').insert({
    clinic_id: data.clinicId,
    conversation_id: data.conversationId,
    direction: 'outbound',
    content_type: 'text',
    body: data.text,
    provider_message_id: data.providerMessageId,
    status: 'sent',
    // A marca que permite auditar depois o que a máquina disse em nome da
    // clínica — e distinguir do que uma pessoa escreveu.
    is_from_ai: true,
    sent_at: new Date().toISOString(),
  })
}

/**
 * Passa a conversa para a fila humana.
 *
 * `is_ai_handled: false` é definitivo por conversa: depois que um assunto exigiu
 * gente, a máquina não retoma sozinha no meio do fio.
 *
 * # O motivo vira NOTA INTERNA, e é isso que faz a recepção priorizar
 *
 * `message_direction` ganhou 'internal' em 12/08/2026 exatamente para isto.
 * Antes, o motivo só existia no log do servidor — onde ninguém da clínica olha —
 * e a recepção via uma conversa pendente sem saber por quê. "Possível urgência"
 * e "dúvida de horário" chegam na mesma fila; o que decide qual abrir primeiro é
 * a nota.
 *
 * A nota **não** viaja para o WhatsApp: quem envia é `sendText`, e ele só é
 * chamado no caminho de resposta.
 */
async function escalate(
  client: SupabaseClient<Database>,
  clinicId: string,
  conversationId: string,
  reason: string | null,
): Promise<void> {
  await client
    .from('conversations')
    .update({ is_ai_handled: false, status: 'pending' })
    .eq('id', conversationId)

  if (!reason) return

  const { error } = await client.from('messages').insert({
    clinic_id: clinicId,
    conversation_id: conversationId,
    direction: 'internal',
    content_type: 'text',
    body: reason,
    status: 'delivered',
    // Marca que foi a máquina que escreveu a nota — não uma pessoa da equipe.
    is_from_ai: true,
    sent_at: new Date().toISOString(),
  })

  if (error) {
    // A nota é explicação, não a escalada em si: a conversa já saiu da fila da
    // IA, e é isso que não pode falhar.
    console.error('[whatsapp-ai] nota de escalonamento nao registrada', {
      conversationId,
      reason,
      code: error.code ?? null,
    })
  }
}

/**
 * A clínica autorizou a IA?
 *
 * Falha de leitura conta como DESLIGADO. É a escolha que erra para o lado
 * barato: uma resposta automática a menos custa o tempo de alguém responder à
 * mão; uma a mais é a máquina falando com paciente sem autorização.
 */
async function isAiEnabled(
  client: SupabaseClient<Database>,
  clinicId: string,
): Promise<boolean> {
  const { data, error } = await client
    .from('clinic_settings')
    .select('ai_enabled')
    .eq('clinic_id', clinicId)
    .maybeSingle()

  if (error) {
    console.error('[whatsapp-ai] nao foi possivel ler ai_enabled', {
      code: error.code ?? null,
    })
    return false
  }

  return data?.ai_enabled === true
}

async function loadClinicFacts(
  client: SupabaseClient<Database>,
  clinicId: string,
): Promise<ClinicFacts> {
  const [{ data: clinic }, { data: settings }] = await Promise.all([
    client
      .from('clinics')
      .select('trade_name, phone, address')
      .eq('id', clinicId)
      .single(),
    client
      .from('clinic_settings')
      .select('business_hours')
      .eq('clinic_id', clinicId)
      .maybeSingle(),
  ])

  /*
   * O horário só é afirmado quando foi REALMENTE salvo pela clínica.
   *
   * `parseStoredBusinessHours` distingue três origens, e a distinção é o ponto:
   * `default` é o palpite que a tela de configurações exibe para quem ainda não
   * preencheu — anunciá-lo ao paciente seria a IA afirmando um expediente que
   * ninguém confirmou, que é o mesmo erro de inventar, só que com fonte
   * plausível.
   *
   * Com `null`, o prompt manda dizer que confirma com a equipe.
   */
  const parsed = parseStoredBusinessHours(settings?.business_hours)
  const businessHours =
    parsed.source === 'stored' ? describeBusinessHours(parsed.value) : null

  return {
    tradeName: clinic?.trade_name ?? 'a clínica',
    businessHours,
    /*
     * Endereço e telefone saem do cadastro da clínica (Configurações →
     * Identidade). Quando não preenchidos, seguem `null` — e o prompt manda a IA
     * dizer que confirma com a equipe, em vez de inventar uma rua.
     */
    address: formatClinicAddress(parseStoredClinicAddress(clinic?.address)),
    phone: clinic?.phone ?? null,
  }
}

async function loadHistory(
  client: SupabaseClient<Database>,
  conversationId: string,
): Promise<AiTurn[]> {
  const { data } = await client
    .from('messages')
    .select('direction, body')
    .eq('conversation_id', conversationId)
    .in('direction', ['inbound', 'outbound'])
    .order('created_at', { ascending: false })
    .limit(10)

  return (data ?? [])
    .reverse()
    .flatMap((row) =>
      row.body
        ? [
            {
              role:
                row.direction === 'inbound' ? ('user' as const) : ('assistant' as const),
              text: row.body,
            },
          ]
        : [],
    )
}

/**
 * Consumo em `ai_usage_log` — best-effort.
 *
 * Registra os tokens reais devolvidos pela OpenAI. Falhar aqui não pode impedir
 * a resposta que já foi gerada e paga.
 *
 * # `cost_usd_micros` fica ZERO, e zero aqui significa "não calculado"
 *
 * A coluna é NOT NULL e a API não devolve custo — só tokens. Converter exige
 * uma tabela de preço por modelo, que muda com o tempo e não está no produto;
 * inventar um valor daria à clínica um número de gasto que não corresponde à
 * fatura, que é pior que não ter número nenhum.
 *
 * O que fica utilizável é a contagem de tokens e o modelo, por clínica e
 * período — o suficiente para ver consumo crescer. O valor em reais está no
 * painel da OpenAI até que a tabela de preços exista.
 */
async function logUsage(
  client: SupabaseClient<Database>,
  clinicId: string,
  answer: { model: string; inputTokens: number; outputTokens: number },
): Promise<void> {
  try {
    await client.from('ai_usage_log').insert({
      clinic_id: clinicId,
      feature: 'patient_chat',
      model: answer.model,
      input_tokens: answer.inputTokens,
      output_tokens: answer.outputTokens,
      // A OpenAI não usa cache neste caminho: uma conversa curta por chamada.
      cache_read_tokens: 0,
      cache_creation_tokens: 0,
      cost_usd_micros: 0,
      was_error: false,
      occurred_at: new Date().toISOString(),
    })
  } catch (cause) {
    console.error('[whatsapp-ai] uso nao registrado', {
      kind: cause instanceof Error ? cause.name : typeof cause,
    })
  }
}
