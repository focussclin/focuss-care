import { describe, expect, it, vi } from 'vitest'

import { SupabaseMessageTemplateRepository } from './SupabaseMessageTemplateRepository'

/**
 * Contrato dos modelos de mensagem.
 *
 * Sem banco e sem rede — o cliente é um duplo. `message_templates` já existe no
 * schema aplicado. O que se prova aqui é o que a aplicação **não** escreve
 * (`is_approved` e `provider_template_id`, que são do provedor) e que
 * `variables` sai sempre do corpo.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const OTHER_CLINIC = 'b4b7c0f2-1f6a-4a55-9d5a-2f7b1c3d4e5f'
const TEMPLATE = '11111111-1111-4111-8111-111111111111'

interface RecordedCall {
  table: string
  method: string
  args: unknown[]
}

function templateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TEMPLATE,
    clinic_id: CLINIC,
    name: 'Confirmação de consulta',
    category: 'Agendamento',
    language: 'pt-BR',
    body: 'Olá {{nome}}, sua consulta é {{data}}.',
    variables: ['nome', 'data'],
    provider_template_id: null,
    is_approved: false,
    is_active: true,
    updated_at: '2026-08-10T10:00:00.000Z',
    ...overrides,
  }
}

interface FakeOptions {
  rows?: unknown[]
  singles?: unknown[]
  error?: { code?: string | null; message?: string | null }
}

function repository(options: FakeOptions = {}) {
  const calls: RecordedCall[] = []
  const singles = [...(options.singles ?? [])]

  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {}

    const chain = (method: string) => (...args: unknown[]) => {
      calls.push({ table, method, args })
      return builder
    }

    for (const method of ['select', 'eq', 'order', 'limit', 'insert', 'update']) {
      builder[method] = chain(method)
    }

    const single = async () => ({
      data: options.error ? null : (singles.shift() ?? null),
      error: options.error ?? null,
    })

    builder.single = async () => {
      calls.push({ table, method: 'single', args: [] })
      return single()
    }
    builder.maybeSingle = async () => {
      calls.push({ table, method: 'maybeSingle', args: [] })
      return single()
    }
    builder.then = (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) =>
      Promise.resolve({
        data: options.error ? null : (options.rows ?? []),
        error: options.error ?? null,
      }).then(onFulfilled, onRejected)

    return builder
  })

  return {
    calls,
    argsOf: (method: string) => calls.filter((call) => call.method === method).map((call) => call.args),
    subject: new SupabaseMessageTemplateRepository({ from } as never),
  }
}

/**
 * As duas colunas do provedor.
 *
 * `is_approved` e `provider_template_id` são preenchidos por quem aprova modelo
 * de mensagem — a Meta, no caso do WhatsApp Business. Marcá-los aqui afirmaria
 * uma aprovação que ninguém deu, e o erro só apareceria no primeiro envio
 * recusado.
 */
describe('a aplicação não escreve o que é do provedor', () => {
  it('o update não toca em `is_approved` nem em `provider_template_id`', async () => {
    const { subject, argsOf } = repository({ singles: [templateRow()] })

    await subject.update(CLINIC, TEMPLATE, {
      name: 'Confirmação',
      category: null,
      body: 'Olá {{nome}}.',
    })

    const patch = argsOf('update')[0][0] as Record<string, unknown>
    expect(patch).not.toHaveProperty('is_approved')
    expect(patch).not.toHaveProperty('provider_template_id')
  })

  it('o insert nasce sem aprovação, e sem id de provedor', async () => {
    /*
     * `is_approved: false` é o único valor honesto no nascimento — o modelo
     * acabou de ser escrito e nenhum provedor o viu. Ele aparece porque a
     * coluna é `not null`, e não porque a aplicação decide aprovação.
     */
    const { subject, argsOf } = repository({ singles: [templateRow()] })

    await subject.create(CLINIC, {
      name: 'Confirmação',
      category: null,
      body: 'Olá {{nome}}.',
    })

    const payload = argsOf('insert')[0][0] as Record<string, unknown>
    expect(payload.is_approved).toBe(false)
    expect(payload).not.toHaveProperty('provider_template_id')
  })

  it('o estado de aprovação é LIDO e devolvido', async () => {
    const { subject } = repository({ rows: [templateRow({ is_approved: true })] })

    const [template] = await subject.list(CLINIC)

    expect(template.isApproved).toBe(true)
  })

  it('desativar mexe só em `is_active` e no carimbo', async () => {
    const { subject, argsOf } = repository({ singles: [templateRow({ is_active: false })] })

    await subject.setActive(CLINIC, TEMPLATE, false)

    expect(Object.keys(argsOf('update')[0][0] as object).sort()).toEqual([
      'is_active',
      'updated_at',
    ])
  })
})

describe('variáveis saem do corpo', () => {
  it('a escrita grava o que o texto contém', async () => {
    const { subject, argsOf } = repository({ singles: [templateRow()] })

    await subject.create(CLINIC, {
      name: 'Confirmação',
      category: null,
      body: 'Olá {{nome}}, dia {{data}}.',
    })

    expect((argsOf('insert')[0][0] as Record<string, unknown>).variables).toEqual([
      'nome',
      'data',
    ])
  })

  it('a leitura recalcula, e ignora a coluna divergente', async () => {
    /*
     * A coluna é `jsonb` e o banco aceita qualquer coisa: linha gravada por
     * fora pode ter lista que não corresponde ao texto. Confiar nela mostraria
     * variáveis que a mensagem não usa.
     */
    const { subject } = repository({
      rows: [templateRow({ body: 'Olá {{nome}}.', variables: ['telefone', 'cpf'] })],
    })

    const [template] = await subject.list(CLINIC)

    expect(template.variables).toEqual(['nome'])
  })

  it('idioma fixo vai no insert', async () => {
    const { subject, argsOf } = repository({ singles: [templateRow()] })

    await subject.create(CLINIC, { name: 'X', category: null, body: 'Oi.' })

    expect((argsOf('insert')[0][0] as Record<string, unknown>).language).toBe('pt-BR')
  })
})

describe('escopo e recusas', () => {
  it('a leitura filtra pela clínica recebida', async () => {
    const { subject, argsOf } = repository({ rows: [templateRow()] })

    await subject.list(OTHER_CLINIC)

    expect(argsOf('eq')).toContainEqual(['clinic_id', OTHER_CLINIC])
  })

  it('zero linhas com o modelo ainda legível é recusa de escrita', async () => {
    const { subject } = repository({ singles: [null, { id: TEMPLATE }] })

    await expect(subject.setActive(CLINIC, TEMPLATE, false)).rejects.toMatchObject({
      reason: 'write-forbidden',
    })
  })

  it('zero linhas com o modelo ausente é not-found', async () => {
    const { subject } = repository({ singles: [null, null] })

    await expect(subject.setActive(CLINIC, TEMPLATE, false)).rejects.toMatchObject({
      reason: 'not-found',
    })
  })

  it('recusa da policy é forbidden', async () => {
    const { subject } = repository({ error: { code: '42501' } })

    await expect(subject.list(CLINIC)).rejects.toMatchObject({ reason: 'forbidden' })
  })

  it('queda de rede é retentável', async () => {
    const { subject } = repository({ error: { message: 'fetch failed' } })

    await expect(subject.list(CLINIC)).rejects.toMatchObject({ reason: 'unavailable' })
  })
})
