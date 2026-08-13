import { describe, expect, it } from 'vitest'

import { receiptAdvances, receiptStatusOf } from './messageReceipt'

/**
 * O recibo de entrega, e a razão de ele só avançar.
 *
 * Os eventos do WhatsApp chegam fora de ordem — e o provedor reenvia recibos
 * antigos depois de reconectar. Sem a regra, uma mensagem já lida voltaria para
 * "entregue" na tela da recepção, que concluiria que o paciente não viu e
 * mandaria de novo.
 */

describe('tradução do status do provedor', () => {
  it('DELIVERY_ACK vira entregue', () => {
    expect(receiptStatusOf('DELIVERY_ACK')).toBe('delivered')
  })

  it('READ e PLAYED viram lido', () => {
    // PLAYED é áudio ouvido: para efeito de recibo, foi lido.
    expect(receiptStatusOf('READ')).toBe('read')
    expect(receiptStatusOf('PLAYED')).toBe('read')
  })

  it('PENDING e SERVER_ACK não acrescentam nada', () => {
    // A mensagem já nasce 'sent' no envio; regravar isso é escrita à toa.
    expect(receiptStatusOf('PENDING')).toBeNull()
    expect(receiptStatusOf('SERVER_ACK')).toBeNull()
  })

  it('ausente ou desconhecido devolve null em vez de chutar', () => {
    expect(receiptStatusOf(undefined)).toBeNull()
    expect(receiptStatusOf(null)).toBeNull()
    expect(receiptStatusOf('QUALQUER_COISA_NOVA')).toBeNull()
  })

  it('não depende da caixa do texto', () => {
    expect(receiptStatusOf('delivery_ack')).toBe('delivered')
  })
})

describe('o status só avança', () => {
  it('sent -> delivered -> read', () => {
    expect(receiptAdvances('sent', 'delivered')).toBe(true)
    expect(receiptAdvances('delivered', 'read')).toBe(true)
    expect(receiptAdvances('sent', 'read')).toBe(true)
  })

  it('recibo atrasado NÃO regride o estado', () => {
    /*
     * O caso real: `READ` chega antes de `DELIVERY_ACK`. Sem esta regra, a
     * mensagem lida voltaria a "entregue" e a recepção mandaria de novo.
     */
    expect(receiptAdvances('read', 'delivered')).toBe(false)
  })

  it('recibo repetido não é reaplicado', () => {
    // Reconexão do provedor reenvia recibos: a escrita seria só ruído.
    expect(receiptAdvances('delivered', 'delivered')).toBe(false)
    expect(receiptAdvances('read', 'read')).toBe(false)
  })

  it('falha é terminal — nenhum recibo a ressuscita', () => {
    // Se o provedor recusou a mensagem, ela não foi entregue a ninguém.
    expect(receiptAdvances('failed', 'delivered')).toBe(false)
    expect(receiptAdvances('failed', 'read')).toBe(false)
  })

  it('mensagem ainda na fila também avança', () => {
    expect(receiptAdvances('queued', 'delivered')).toBe(true)
  })
})
