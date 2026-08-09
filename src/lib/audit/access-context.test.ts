import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * O guarda que separa acesso humano de pré-busca do navegador.
 *
 * # Por que este teste existe
 *
 * Medido no banco em 09/08/2026: `audit_log` tinha 742 linhas, **731 delas
 * `record.read`**, todas apontando para a LISTA e nenhuma para um paciente, em
 * rajadas de exatamente 8 no mesmo segundo. Ninguém lê prontuário oito vezes por
 * segundo: era o Next pré-buscando `/prontuarios` e o corpo da rota registrando
 * acesso a cada renderização.
 *
 * Numa trilha de dado de saúde isso é pior que ruído — ela existe para responder
 * "quem leu o prontuário desta paciente", e o evento verdadeiro fica enterrado
 * sob os que não aconteceram.
 *
 * O caso mais importante aqui é o último: **na dúvida, audita**. Perder um
 * acesso real é pior que gravar um a mais.
 */

const headers = vi.fn()

vi.mock('next/headers', () => ({
  headers: () => headers(),
}))

const { isPrefetchRender } = await import('./access-context')

/** Um `Headers` com os pares dados, como o Next entrega. */
function requestHeaders(entries: Record<string, string> = {}) {
  return new Headers(entries)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('pré-busca não é acesso', () => {
  it('reconhece o header que o roteador do Next envia', async () => {
    headers.mockResolvedValue(requestHeaders({ 'next-router-prefetch': '1' }))

    expect(await isPrefetchRender()).toBe(true)
  })

  it('reconhece independentemente do valor — o que conta é a presença', async () => {
    // O roteador manda "1"; depender do valor exato quebraria numa versão que
    // passasse "true" ou vazio.
    headers.mockResolvedValue(requestHeaders({ 'next-router-prefetch': '' }))

    expect(await isPrefetchRender()).toBe(true)
  })

  it('não depende da caixa do nome', async () => {
    headers.mockResolvedValue(requestHeaders({ 'Next-Router-Prefetch': '1' }))

    expect(await isPrefetchRender()).toBe(true)
  })
})

describe('navegação de verdade é acesso', () => {
  it('sem o header, registra', async () => {
    headers.mockResolvedValue(requestHeaders())

    expect(await isPrefetchRender()).toBe(false)
  })

  it('requisição RSC comum não é pré-busca', async () => {
    /*
     * Navegar de uma tela para outra manda `rsc: 1` SEM
     * `next-router-prefetch` — é acesso real, e precisa ser auditado.
     */
    headers.mockResolvedValue(requestHeaders({ rsc: '1' }))

    expect(await isPrefetchRender()).toBe(false)
  })
})

describe('na dúvida, audita', () => {
  it('se `headers()` lançar, trata como acesso', async () => {
    // Acontece fora de um request (prerender de build). Devolver `true` ali
    // silenciaria auditoria por causa de um erro de leitura de header.
    headers.mockImplementation(() => {
      throw new Error('fora de request')
    })

    expect(await isPrefetchRender()).toBe(false)
  })

  it('se `headers()` rejeitar, também trata como acesso', async () => {
    headers.mockRejectedValue(new Error('indisponível'))

    expect(await isPrefetchRender()).toBe(false)
  })
})
