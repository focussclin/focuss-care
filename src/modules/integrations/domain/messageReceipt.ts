import type { MessageStatus } from '@/lib/supabase/database.types'

/**
 * Recibo de entrega do WhatsApp.
 *
 * # O status só AVANÇA, e é isso que a regra protege
 *
 * Os recibos chegam fora de ordem com frequência: o `READ` passa na frente do
 * `DELIVERY_ACK`, e o provedor reenvia recibos antigos depois de uma reconexão.
 * Sem ordem, uma mensagem já lida voltaria para "entregue" na tela da recepção —
 * que concluiria que o paciente não viu, e mandaria de novo.
 *
 * A escala é a do próprio ciclo de vida: `queued` < `sent` < `delivered` <
 * `read`. `failed` é terminal: um recibo atrasado não ressuscita mensagem que o
 * provedor recusou.
 */

const RANK: Record<string, number> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  read: 3,
}

/**
 * O status da Evolution -> o do produto.
 *
 * `PENDING` e `SERVER_ACK` devolvem `null` porque não acrescentam nada: a
 * mensagem já é gravada como `sent` no momento do envio. `PLAYED` é áudio
 * ouvido — para efeito de recibo, foi lido.
 */
export function receiptStatusOf(raw: string | undefined | null): MessageStatus | null {
  switch (raw?.toUpperCase()) {
    case 'DELIVERY_ACK':
      return 'delivered'
    case 'READ':
    case 'PLAYED':
      return 'read'
    default:
      return null
  }
}

/** Este recibo adianta o estado da mensagem, ou é eco de algo já sabido? */
export function receiptAdvances(
  current: MessageStatus,
  incoming: MessageStatus,
): boolean {
  if (current === 'failed') return false

  return (RANK[incoming] ?? 0) > (RANK[current] ?? 0)
}
