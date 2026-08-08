import { describe, expect, it, vi } from 'vitest'

import { SupabaseProfileRepository } from './SupabaseProfileRepository'

/**
 * Contrato do perfil pessoal.
 *
 * O que este arquivo protege é curto e é tudo: que a escrita alcance **uma
 * linha só** — a de quem está pedindo — e que ela não toque em coluna nenhuma
 * além de nome e telefone. `email`, `avatar_url` e `active_clinic_id` existem na
 * tabela, e cada uma delas escrita por engano aqui produziria um defeito
 * diferente e caro.
 *
 * Sem banco e sem rede.
 */

const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'

interface RecordedCall {
  method: string
  args: unknown[]
}

function profileRow(overrides: Record<string, unknown> = {}) {
  return {
    id: USER,
    full_name: 'Ana Ribeiro',
    email: 'ana@clinica.com',
    phone: '11988124471',
    ...overrides,
  }
}

function createFakeClient(results: { row?: unknown; error?: { code: string } }) {
  const calls: RecordedCall[] = []

  const from = vi.fn(() => {
    const query: Record<string, unknown> = {}

    for (const method of ['select', 'eq', 'update']) {
      query[method] = (...args: unknown[]) => {
        calls.push({ method, args })
        return query
      }
    }

    query.maybeSingle = async () => {
      calls.push({ method: 'maybeSingle', args: [] })

      if (results.error) return { data: null, error: results.error }

      // `'row' in results` e nao `?? profileRow()`: a linha ausente e um dos
      // casos sob teste, e `null ??` o apagaria.
      return { data: 'row' in results ? results.row : profileRow(), error: null }
    }

    return query
  })

  return { calls, client: { from } as never }
}

describe('update', () => {
  it('escreve APENAS nome e telefone', async () => {
    const fake = createFakeClient({})

    await new SupabaseProfileRepository(fake.client).update(USER, {
      fullName: 'Ana Ribeiro Souza',
      phone: '11988124471',
    })

    const patch = fake.calls.find((call) => call.method === 'update')
      ?.args[0] as Record<string, unknown>

    expect(Object.keys(patch).sort()).toEqual([
      'full_name',
      'phone',
      'updated_at',
    ])

    /*
     * As três ausências, e o que cada uma custaria:
     *  - `email` gravado aqui deixaria a pessoa vendo um endereço e entrando
     *    com outro, porque quem decide o login é o Supabase Auth.
     *  - `active_clinic_id` num formulário de perfil seria trocar de tenant por
     *    um campo de texto.
     *  - `id` reescrito seria assumir a identidade de outra pessoa.
     */
    expect(patch).not.toHaveProperty('email')
    expect(patch).not.toHaveProperty('active_clinic_id')
    expect(patch).not.toHaveProperty('id')
  })

  it('filtra pelo usuário da sessão, e por mais nada', async () => {
    const fake = createFakeClient({})

    await new SupabaseProfileRepository(fake.client).update(USER, {
      fullName: 'Ana Ribeiro',
      phone: null,
    })

    const filters = fake.calls.filter((call) => call.method === 'eq')

    // Um filtro só, e é o dono da linha. Sem clinic_id: perfil nao pertence a
    // uma clinica, pertence a pessoa.
    expect(filters).toEqual([{ method: 'eq', args: ['id', USER] }])
  })

  it('telefone nulo é gravado como nulo, não como string vazia', async () => {
    const fake = createFakeClient({ row: profileRow({ phone: null }) })

    const profile = await new SupabaseProfileRepository(fake.client).update(
      USER,
      { fullName: 'Ana Ribeiro', phone: null },
    )

    const patch = fake.calls.find((call) => call.method === 'update')
      ?.args[0] as Record<string, unknown>

    // String vazia faria uma busca por "quem tem telefone" devolver quem nao
    // tem.
    expect(patch.phone).toBeNull()
    expect(profile.phone).toBeNull()
  })

  it('zero linhas vira not-found, e não "sem permissão"', async () => {
    const fake = createFakeClient({ row: null })

    /*
     * A RLS restringe `profiles` a `auth.uid()`, entao "atualizou nada" so pode
     * ser a linha ausente. Dizer "sem permissao" mandaria a pessoa procurar
     * quem a autorize por um problema que e outro.
     */
    await expect(
      new SupabaseProfileRepository(fake.client).update(USER, {
        fullName: 'Ana Ribeiro',
        phone: null,
      }),
    ).rejects.toMatchObject({ reason: 'not-found' })
  })

  it('recusa da RLS vira forbidden', async () => {
    const fake = createFakeClient({ error: { code: '42501' } })

    await expect(
      new SupabaseProfileRepository(fake.client).update(USER, {
        fullName: 'Ana Ribeiro',
        phone: null,
      }),
    ).rejects.toMatchObject({ reason: 'forbidden' })
  })
})

describe('findById', () => {
  it('perfil ausente devolve null, sem lançar', async () => {
    const fake = createFakeClient({ row: null })

    // Quem acabou de se cadastrar pode nao ter a linha ainda, e a tela de
    // configuracoes precisa abrir de qualquer forma.
    await expect(
      new SupabaseProfileRepository(fake.client).findById(USER),
    ).resolves.toBeNull()
  })

  it('não seleciona colunas que a tela não usa', async () => {
    const fake = createFakeClient({})

    await new SupabaseProfileRepository(fake.client).findById(USER)

    const columns = fake.calls.find((call) => call.method === 'select')
      ?.args[0] as string

    expect(columns).not.toContain('active_clinic_id')
    expect(columns).not.toContain('avatar_url')
  })
})
