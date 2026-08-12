import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { EvolutionWhatsappGateway } from './EvolutionWhatsappGateway'

/**
 * O adapter da Evolution API — sem rede.
 *
 * As respostas usadas aqui foram COPIADAS de um servidor v2.3.7 real, não
 * inventadas: é o que dá valor ao teste. Um mock imaginado passaria a validar a
 * suposição de quem o escreveu, que é exatamente o erro que este arquivo existe
 * para pegar.
 */

const CREDENTIALS = {
  baseUrl: 'https://evo.exemplo.test',
  apiKey: 'chave-secreta-do-provedor',
  instanceName: 'focuss-clinica',
}

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function json(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

function gateway() {
  return new EvolutionWhatsappGateway(CREDENTIALS)
}

describe('estado da conexão', () => {
  it('traduz `open` para conectado', async () => {
    fetchMock
      .mockResolvedValueOnce(
        json({ instance: { instanceName: 'focuss-clinica', state: 'open' } }),
      )
      .mockResolvedValueOnce(
        json([{ name: 'focuss-clinica', ownerJid: '5511988887777@s.whatsapp.net' }]),
      )

    const connection = await gateway().status('focuss-clinica')

    expect(connection.state).toBe('connected')
    // O JID do protocolo não chega à tela: ela mostra número.
    expect(connection.phoneNumber).toBe('5511988887777')
  })

  it('traduz `connecting` para aguardando leitura', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ instance: { instanceName: 'focuss-clinica', state: 'connecting' } }),
    )

    const connection = await gateway().status('focuss-clinica')

    expect(connection.state).toBe('awaiting_scan')
  })

  it('instância inexistente é DESCONECTADA, não erro', async () => {
    /*
     * 404 é o estado inicial de toda clínica que nunca conectou. Traduzir para
     * falha faria a tela mostrar erro vermelho antes do primeiro clique.
     */
    fetchMock.mockResolvedValueOnce(json({ status: 404 }, 404))

    const connection = await gateway().status('focuss-clinica')

    expect(connection.state).toBe('disconnected')
    expect(connection.qrCode).toBeNull()
  })
})

describe('conectar', () => {
  it('cria a instância e devolve o QR como data URI', async () => {
    fetchMock
      // status: ainda não existe
      .mockResolvedValueOnce(json({}, 404))
      // create
      .mockResolvedValueOnce(
        json({
          instance: { instanceName: 'focuss-clinica', status: 'connecting' },
          qrcode: { base64: 'data:image/png;base64,iVBORw0KGgo=', code: '2@abc' },
        }),
      )

    const connection = await gateway().connect('focuss-clinica')

    expect(connection.state).toBe('awaiting_scan')
    expect(connection.qrCode).toBe('data:image/png;base64,iVBORw0KGgo=')

    const [, criacao] = fetchMock.mock.calls
    expect(criacao[0]).toContain('/instance/create')
    expect(JSON.parse(criacao[1].body)).toMatchObject({
      instanceName: 'focuss-clinica',
      qrcode: true,
    })
  })

  it('base64 puro do provedor vira data URI', async () => {
    // A tela põe o valor num `<img src>`; sem o prefixo, não renderiza nada.
    fetchMock
      .mockResolvedValueOnce(json({}, 404))
      .mockResolvedValueOnce(json({ qrcode: { base64: 'iVBORw0KGgo=' } }))

    const connection = await gateway().connect('focuss-clinica')

    expect(connection.qrCode).toBe('data:image/png;base64,iVBORw0KGgo=')
  })

  it('instância já existente NÃO é recriada — pede código novo', async () => {
    /*
     * Recriar devolveria 403 do provedor, e quem clicou leria "erro" quando só
     * queria outro QR.
     */
    fetchMock
      .mockResolvedValueOnce(
        json({ instance: { instanceName: 'focuss-clinica', state: 'connecting' } }),
      )
      .mockResolvedValueOnce(json({ base64: 'data:image/png;base64,NOVO', code: '2@x' }))

    const connection = await gateway().connect('focuss-clinica')

    expect(connection.qrCode).toBe('data:image/png;base64,NOVO')

    const rotas = fetchMock.mock.calls.map((call) => String(call[0]))
    expect(rotas.some((rota) => rota.includes('/instance/connect/'))).toBe(true)
    expect(rotas.some((rota) => rota.includes('/instance/create'))).toBe(false)
  })

  it('instância EXISTENTE porém fechada não é recriada', async () => {
    /*
     * O caso que só apareceu contra o provedor real: depois de desconectar, a
     * instância continua lá com `state: 'close'`. O domínio chama isso de
     * `disconnected` — igual a "nunca criada" —, mas mandar `/instance/create`
     * aqui é recusado pelo provedor, e a pessoa lê erro querendo só outro QR.
     */
    fetchMock
      .mockResolvedValueOnce(
        json({ instance: { instanceName: 'focuss-clinica', state: 'close' } }),
      )
      .mockResolvedValueOnce(json({ base64: 'data:image/png;base64,APOSFECHAR' }))

    const connection = await gateway().connect('focuss-clinica')

    expect(connection.state).toBe('awaiting_scan')
    expect(connection.qrCode).toBe('data:image/png;base64,APOSFECHAR')

    const rotas = fetchMock.mock.calls.map((call) => String(call[0]))
    expect(rotas.some((rota) => rota.includes('/instance/create'))).toBe(false)
  })

  it('já conectado não gera QR nenhum', async () => {
    fetchMock
      .mockResolvedValueOnce(
        json({ instance: { instanceName: 'focuss-clinica', state: 'open' } }),
      )
      .mockResolvedValueOnce(json([]))

    const connection = await gateway().connect('focuss-clinica')

    expect(connection.state).toBe('connected')
    expect(connection.qrCode).toBeNull()
  })
})

describe('o que o adapter NÃO deixa vazar', () => {
  it('a chave viaja no header, nunca na URL', async () => {
    // URL vai para log de proxy e histórico; header, não.
    fetchMock.mockResolvedValueOnce(json({ instance: { state: 'close' } }))

    await gateway().status('focuss-clinica')

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).not.toContain(CREDENTIALS.apiKey)
    expect(init.headers.apikey).toBe(CREDENTIALS.apiKey)
  })

  it('o corpo do erro do provedor não entra na mensagem', async () => {
    /*
     * A Evolution ecoa o payload enviado nas mensagens de erro, e o payload
     * carrega a chave da instância.
     */
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ message: `falhou com apikey ${CREDENTIALS.apiKey}` }),
    })

    await expect(gateway().status('focuss-clinica')).rejects.toMatchObject({
      reason: 'unexpected',
    })

    await expect(gateway().status('focuss-clinica')).rejects.not.toThrow(
      new RegExp(CREDENTIALS.apiKey),
    )
  })

  it('chave recusada vira `unauthorized`, não erro genérico', async () => {
    // A tela precisa dizer "confira a API key", não "tente de novo".
    fetchMock.mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })

    await expect(gateway().status('focuss-clinica')).rejects.toMatchObject({
      reason: 'unauthorized',
    })
  })

  it('queda de rede vira `unavailable`', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))

    await expect(gateway().status('focuss-clinica')).rejects.toMatchObject({
      reason: 'unavailable',
    })
  })
})

describe('desconectar', () => {
  it('faz logout sem apagar a instância', async () => {
    // Apagar destruiria o histórico no provedor; trocar o aparelho da recepção
    // é rotina.
    fetchMock.mockResolvedValueOnce(json({}))

    await gateway().disconnect('focuss-clinica')

    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('/instance/logout/')
    expect(String(url)).not.toContain('/instance/delete/')
    expect(init.method).toBe('DELETE')
  })
})
