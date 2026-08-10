import { describe, expect, it, vi } from 'vitest'

import { isLeadRepositoryError } from '../domain/LeadRepositoryError'
import { SupabaseLeadRepository } from './SupabaseLeadRepository'

/**
 * A conversão do lead em paciente.
 *
 * # Por que ela é RPC, e o teste verifica isso
 *
 * Converter faz três escritas que precisam valer juntas: cria a linha em
 * `patients`, marca o lead apontando para ela, e registra o evento de etapa.
 * Em três idas ao banco, uma falha no meio deixa **um paciente órfão** — uma
 * pessoa no cadastro clínico que ninguém pediu, sem lead que a explique.
 *
 * O detalhe que torna isso concreto: `patients` **existe** no schema remoto e
 * `clinic_leads` não. Uma implementação em duas etapas conseguiria criar o
 * paciente e falhar no lead.
 *
 * Por isso o primeiro teste é sobre a AUSÊNCIA de `from('patients')`.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const LEAD = '11111111-1111-4111-8111-111111111111'
const PATIENT = '33333333-3333-4333-8333-333333333333'

function createFakeClient(
  options: { data?: string | null; error?: { code?: string; message?: string } } = {},
) {
  const rpcCalls: { fn: string; args: unknown }[] = []

  const rpc = vi.fn(async (fn: string, args: unknown) => {
    rpcCalls.push({ fn, args })
    return {
      data: options.error ? null : ('data' in options ? options.data : PATIENT),
      error: options.error ?? null,
    }
  })

  const from = vi.fn(() => {
    throw new Error('a conversão não pode ler nem escrever tabela direto')
  })

  return { rpcCalls, from, client: { rpc, from } as never }
}

function subject(options: Parameters<typeof createFakeClient>[0] = {}) {
  const fake = createFakeClient(options)
  return { fake, repository: new SupabaseLeadRepository(fake.client) }
}

describe('convert', () => {
  it('acontece numa chamada só, e não toca em tabela direto', async () => {
    const { fake, repository } = subject()

    await repository.convert(CLINIC, LEAD)

    expect(fake.rpcCalls).toHaveLength(1)
    expect(fake.rpcCalls[0].fn).toBe('convert_lead_to_patient')
    // O fake lança se `from` for chamado: três escritas separadas não passam.
    expect(fake.from).not.toHaveBeenCalled()
  })

  it('não manda clinic_id — a função resolve pela sessão', async () => {
    /*
     * Esta operação cria uma FICHA DE PACIENTE. Um tenant vindo do chamador
     * seria uma pessoa cadastrada na clínica de outra gente.
     */
    const { fake, repository } = subject()

    await repository.convert(CLINIC, LEAD)

    expect(fake.rpcCalls[0].args).toEqual({ p_lead_id: LEAD })
    expect(JSON.stringify(fake.rpcCalls[0].args)).not.toContain(CLINIC)
  })

  it('devolve o id do paciente criado', async () => {
    const { repository } = subject()

    await expect(repository.convert(CLINIC, LEAD)).resolves.toEqual({
      patientId: PATIENT,
    })
  })

  it('retorno vazio é falha, e não sucesso silencioso', async () => {
    /*
     * Se a função devolvesse null, a tela levaria a pessoa para
     * `/pacientes/undefined`. Melhor recusar aqui.
     */
    const { repository } = subject({ data: null })

    await expect(repository.convert(CLINIC, LEAD)).rejects.toSatisfy(
      (cause: unknown) =>
        isLeadRepositoryError(cause) && cause.reason === 'unexpected',
    )
  })

  it('converter duas vezes tem razão própria', async () => {
    /*
     * `already-converted`, e não `unexpected`. A ação que resolve é abrir a
     * ficha que já existe — "tente de novo" faria alguém cadastrar o paciente
     * à mão e duplicar a pessoa.
     */
    const { repository } = subject({
      error: { code: '23505', message: 'ALREADY_CONVERTED' },
    })

    await expect(repository.convert(CLINIC, LEAD)).rejects.toSatisfy(
      (cause: unknown) =>
        isLeadRepositoryError(cause) && cause.reason === 'already-converted',
    )
  })

  it('lead de outra clínica vira not-found', async () => {
    const { repository } = subject({
      error: { code: 'P0002', message: 'LEAD_NOT_FOUND' },
    })

    await expect(repository.convert(CLINIC, LEAD)).rejects.toSatisfy(
      (cause: unknown) =>
        isLeadRepositoryError(cause) && cause.reason === 'not-found',
    )
  })

  it('função ausente é schema-not-ready, e não indisponibilidade', async () => {
    /*
     * A distinção que a tela depende: `schema-not-ready` faz a interface
     * declarar a pendência da migration; `unavailable` mandaria recarregar
     * para sempre. Para RPC o código é `42883`/`PGRST202`, e não `42P01`.
     */
    for (const code of ['42883', 'PGRST202']) {
      const { repository } = subject({ error: { code } })

      await expect(repository.convert(CLINIC, LEAD)).rejects.toSatisfy(
        (cause: unknown) =>
          isLeadRepositoryError(cause) && cause.reason === 'schema-not-ready',
      )
    }
  })

  it('recusa de papel vira forbidden', async () => {
    const { repository } = subject({ error: { code: '42501' } })

    await expect(repository.convert(CLINIC, LEAD)).rejects.toSatisfy(
      (cause: unknown) =>
        isLeadRepositoryError(cause) && cause.reason === 'forbidden',
    )
  })
})
