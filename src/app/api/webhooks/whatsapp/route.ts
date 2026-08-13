import { NextResponse, type NextRequest } from 'next/server'

import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import {
  receiptAdvances,
  receiptStatusOf,
} from '@/modules/integrations/domain/messageReceipt'
import { handleIncomingWhatsapp } from '@/modules/integrations/infrastructure/whatsapp-inbound'

/**
 * Recebimento de mensagens do WhatsApp (Evolution API).
 *
 * # Esta é a única rota do produto que roda SEM sessão de usuário
 *
 * Quem chama é o provedor, não uma pessoa: não há cookie, não há
 * `current_clinic_id()`, e a RLS não tem em quem se apoiar. Por isso ela usa o
 * cliente administrativo — e por isso cada linha abaixo existe.
 *
 * A rota é pública na internet. Sem as duas travas seguintes, qualquer um
 * poderia injetar mensagem falsa na conversa de um paciente e fazer a IA
 * responder em nome da clínica:
 *
 *  1. **Segredo compartilhado** (`WHATSAPP_WEBHOOK_SECRET`), comparado em tempo
 *     constante. Sem ele configurado, a rota recusa tudo — falhar fechado é o
 *     único padrão aceitável para um endpoint que escreve em nome de terceiros.
 *  2. **Instância conhecida**: o `instance` do payload precisa bater com a
 *     credencial de alguma clínica. Instância desconhecida não vira conversa.
 *
 * # Responde 200 mesmo quando ignora
 *
 * Erro faz a Evolution reenviar, e reenvio vira mensagem duplicada para o
 * paciente. O corpo diz o que aconteceu; o status diz "recebi, pode seguir".
 */

/** Só POST. O provedor não tem por que ler nada daqui. */
export const dynamic = 'force-dynamic'

/**
 * Comparação em tempo constante.
 *
 * `a === b` sai no primeiro byte diferente, e a diferença de tempo entre uma
 * tentativa e outra vaza o segredo caractere a caractere para quem mede.
 */
function secretMatches(received: string, expected: string): boolean {
  if (received.length !== expected.length) return false

  let diff = 0
  for (let index = 0; index < received.length; index += 1) {
    diff |= received.charCodeAt(index) ^ expected.charCodeAt(index)
  }

  return diff === 0
}

interface EvolutionEvent {
  event?: string
  instance?: string
  data?: {
    key?: { remoteJid?: string; fromMe?: boolean; id?: string }
    pushName?: string
    message?: {
      conversation?: string
      extendedTextMessage?: { text?: string }
    }
    /** `messages.update` traz o id da mensagem em um destes dois campos. */
    keyId?: string
    messageId?: string
    /** 'DELIVERY_ACK', 'READ', 'PLAYED'… */
    status?: string
  }
}

/** '5511999998888@s.whatsapp.net' -> '5511999998888'. Grupo devolve null. */
function phoneFromJid(jid: string | undefined): string | null {
  if (!jid || jid.includes('@g.us')) return null

  const [number] = jid.split('@')
  return number && /^\d{8,15}$/.test(number) ? number : null
}

function textOf(event: EvolutionEvent): string | null {
  const message = event.data?.message
  const text = message?.conversation ?? message?.extendedTextMessage?.text

  return typeof text === 'string' && text.trim().length > 0 ? text.trim() : null
}

type AdminClient = ReturnType<typeof createSupabaseAdminClient>

type TenantHandle =
  | { ok: true; admin: AdminClient; clinicId: string }
  | { ok: false; response: NextResponse }

/**
 * Abre o tenant da instância — a trava 2, para os DOIS caminhos.
 *
 * O recibo passava por fora desta verificação: escrevia por `provider_message_id`
 * apenas, com o cliente administrativo, que ignora RLS. O segredo do webhook é um
 * só para todas as clínicas, então bastava o provedor de uma clínica mandar um
 * `messages.update` com o id de outra para carimbar a mensagem alheia. Estado de
 * entrega é pouco dado, mas atravessar o tenant é o invariante que este produto
 * não abre (P3) — e a RLS não pode defender o que roda como service role.
 *
 * `createSupabaseAdminClient()` **lança** quando falta a chave; não devolve nulo.
 * Sem o try, ambiente mal configurado virava 500, e 500 faz a Evolution reenviar
 * a mensagem — exatamente a duplicação que responder 200 evita.
 */
async function openTenant(instance: string): Promise<TenantHandle> {
  let admin: AdminClient

  try {
    admin = createSupabaseAdminClient()
  } catch {
    console.error('[webhook] cliente administrativo indisponivel')
    return {
      ok: false,
      response: NextResponse.json({ ignored: 'unavailable' }, { status: 503 }),
    }
  }

  const clinicId = await clinicOfInstance(admin, instance)
  if (!clinicId) {
    console.warn('[webhook] instancia desconhecida', { instance })
    return {
      ok: false,
      response: NextResponse.json({ ignored: 'unknown-instance' }),
    }
  }

  return { ok: true, admin, clinicId }
}

export async function POST(request: NextRequest) {
  const expected = process.env.WHATSAPP_WEBHOOK_SECRET?.trim()

  if (!expected) {
    console.error('[webhook] WHATSAPP_WEBHOOK_SECRET ausente — recusando')
    return NextResponse.json({ ignored: 'not-configured' }, { status: 503 })
  }

  const received =
    request.headers.get('x-webhook-secret') ??
    request.nextUrl.searchParams.get('secret') ??
    ''

  if (!secretMatches(received, expected)) {
    // 404, e não 401: um endpoint que confirma a própria existência convida a
    // insistir.
    return NextResponse.json({ ignored: 'not-found' }, { status: 404 })
  }

  let event: EvolutionEvent
  try {
    event = (await request.json()) as EvolutionEvent
  } catch {
    return NextResponse.json({ ignored: 'invalid-json' })
  }

  const isReceipt = event.event === 'messages.update'

  if (!isReceipt && event.event !== 'messages.upsert') {
    return NextResponse.json({ ignored: 'other-event' })
  }

  const instance = event.instance?.trim()
  if (!instance) {
    return NextResponse.json({ ignored: 'unsupported-message' })
  }

  /*
   * Recibo de entrega — outro caminho, e por isso vem antes.
   *
   * `messages.update` NÃO é mensagem: é o WhatsApp dizendo que a que já saiu
   * chegou ou foi lida. Tratá-lo como mensagem faria a IA responder ao próprio
   * recibo, em laço.
   */
  if (isReceipt) {
    const tenant = await openTenant(instance)
    if (!tenant.ok) return tenant.response

    return NextResponse.json({
      outcome: await applyReceipt(tenant.admin, tenant.clinicId, event),
    })
  }

  /*
   * As recusas baratas vêm antes de abrir o tenant: `openTenant` lê e decifra
   * uma credencial por clínica, e o eco da própria mensagem enviada é boa parte
   * do tráfego do webhook. Responder a ela seria a IA conversando consigo mesma,
   * em laço.
   */
  if (event.data?.key?.fromMe) {
    return NextResponse.json({ ignored: 'own-message' })
  }

  const phone = phoneFromJid(event.data?.key?.remoteJid)
  const text = textOf(event)

  if (!phone || !text) {
    return NextResponse.json({ ignored: 'unsupported-message' })
  }

  const tenant = await openTenant(instance)
  if (!tenant.ok) return tenant.response

  const outcome = await handleIncomingWhatsapp(tenant.admin, {
    clinicId: tenant.clinicId,
    instanceName: instance,
    fromPhone: phone,
    contactName: event.data?.pushName ?? null,
    text,
    providerMessageId: event.data?.key?.id ?? null,
  })

  return NextResponse.json({ outcome })
}

/**
 * Aplica o recibo de entrega à mensagem que já saiu.
 *
 * A REGRA (o que avança, o que é eco) vive no domínio, em `messageReceipt`:
 * ordem de status é regra de negócio, e dentro de uma rota ela não seria
 * testável nem reaproveitável pelo dia em que outro provedor mandar recibo.
 */
async function applyReceipt(
  admin: AdminClient,
  clinicId: string,
  event: EvolutionEvent,
): Promise<string> {
  const providerMessageId =
    event.data?.keyId ?? event.data?.messageId ?? event.data?.key?.id
  const status = receiptStatusOf(event.data?.status)

  if (!providerMessageId || !status) return 'receipt-ignored'

  /*
   * `clinic_id` nas DUAS consultas, e não só na leitura: quem escreve aqui é o
   * service role, para quem a RLS não vale. O id do provedor é único por
   * instância, não globalmente — sem o recorte, o recibo de uma clínica
   * alcançaria a linha de outra.
   */
  const { data: message, error: readError } = await admin
    .from('messages')
    .select('id, status')
    .eq('clinic_id', clinicId)
    .eq('provider_message_id', providerMessageId)
    .maybeSingle()

  if (readError) {
    console.error('[webhook] recibo nao localizado', {
      code: readError.code ?? null,
    })
    return 'receipt-failed'
  }

  // Recibo de mensagem que não é nossa (ou anterior à integração): nada a fazer.
  if (!message) return 'receipt-unknown-message'

  if (!receiptAdvances(message.status, status)) return 'receipt-stale'

  const { error } = await admin
    .from('messages')
    .update({
      status,
      ...(status === 'delivered'
        ? { delivered_at: new Date().toISOString() }
        : { read_at: new Date().toISOString() }),
    })
    .eq('clinic_id', clinicId)
    .eq('id', message.id)

  if (error) {
    console.error('[webhook] recibo nao aplicado', { code: error.code ?? null })
    return 'receipt-failed'
  }

  return `receipt-${status}`
}

/**
 * De qual clínica é esta instância.
 *
 * A credencial é cifrada, então não dá para consultar por `instanceName` no
 * `where` — cada linha precisa ser aberta e comparada. É aceitável enquanto o
 * número de clínicas com WhatsApp for pequeno; quando não for, o caminho é uma
 * coluna indexada com o nome da instância em claro (nome de instância não é
 * segredo — a chave é).
 */
async function clinicOfInstance(
  admin: AdminClient,
  instance: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from('clinic_integration_credentials')
    .select('clinic_id, encrypted_payload')
    .eq('provider', 'evolution')

  if (error || !data) {
    console.error('[webhook] nao foi possivel resolver a clinica', {
      code: error?.code ?? null,
    })
    return null
  }

  const { decryptIntegrationCredentials } = await import(
    '@/modules/integrations/infrastructure/integration-vault'
  )

  for (const row of data) {
    try {
      const values = await decryptIntegrationCredentials(row.encrypted_payload)
      if (values.instanceName?.trim() === instance) return row.clinic_id
    } catch {
      // Credencial ilegível (chave do cofre trocada) não derruba as outras.
      continue
    }
  }

  return null
}
