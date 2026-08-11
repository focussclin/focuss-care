import { describe, expect, it, vi } from 'vitest'

import { createTimeOffSchema } from '../schemas/team.schema'
import { SupabaseTeamRepository } from './SupabaseTeamRepository'

/**
 * Vínculo trabalhista e ausências (S-02).
 *
 * Arquivo separado do de S-01 de propósito: aquele protege as recusas de acesso,
 * este protege duas coisas diferentes — que salário e CPF **não sejam lidos**, e
 * que uma decisão sobre ausência não seja reescrita.
 *
 * Sem banco e sem rede.
 */

const CLINIC = '7e3b0000-0000-4000-8000-00000000b48e'
const USER = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f'
const TIME_OFF = '9019956f-bdd8-4d61-868d-09b02332dad0'
const EMPLOYEE = '5f2b1a3c-4d5e-4f60-8a71-9b2c3d4e5f60'

interface RecordedCall {
  table: string
  method: string
  args: unknown[]
}

function timeOffRow(overrides: Record<string, unknown> = {}) {
  return {
    id: TIME_OFF,
    employee_id: EMPLOYEE,
    kind: 'ferias',
    status: 'requested',
    starts_on: '2026-09-01',
    ends_on: '2026-09-15',
    reason: 'motivo que nao deve vazar',
    approved_at: null,
    employees: { full_name: 'Ana Ribeiro' },
    ...overrides,
  }
}

function employeeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: EMPLOYEE,
    full_name: 'Ana Ribeiro',
    role_title: 'Recepcionista',
    contract_type: 'clt',
    is_active: true,
    professional_id: null,
    hire_date: null,
    termination_date: null,
    ...overrides,
  }
}

function createFakeClient(
  results: {
    updated?: unknown
    /** Linha devolvida pela LEITURA previa do desligamento. */
    employee?: unknown
  } = {},
) {
  const calls: RecordedCall[] = []

  const from = vi.fn((table: string) => {
    const query: Record<string, unknown> = {}
    const own = () => calls.filter((call) => call.table === table)

    for (const method of ['select', 'eq', 'order', 'limit', 'insert', 'update']) {
      query[method] = (...args: unknown[]) => {
        calls.push({ table, method, args })
        return query
      }
    }

    query.single = async () => {
      calls.push({ table, method: 'single', args: [] })

      if (table === 'employees') {
        return { data: employeeRow(), error: null }
      }

      return { data: timeOffRow(), error: null }
    }

    query.maybeSingle = async () => {
      calls.push({ table, method: 'maybeSingle', args: [] })

      if (table === 'employees') {
        const isUpdate = own().some((call) => call.method === 'update')

        // Antes do update, a leitura previa da admissao; depois, a linha nova.
        return {
          data: isUpdate
            ? ('updated' in results ? results.updated : employeeRow())
            : ('employee' in results ? results.employee : employeeRow()),
          error: null,
        }
      }

      return {
        data: 'updated' in results ? results.updated : timeOffRow(),
        error: null,
      }
    }

    query.then = (
      onFulfilled: (value: unknown) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => {
      const isUpdate = own().some((call) => call.method === 'update')

      return Promise.resolve({
        data: isUpdate ? null : [],
        count: null,
        error: null,
      }).then(onFulfilled, onRejected)
    }

    return query
  })

  return {
    calls,
    client: { from } as never,
    ofTable: (table: string) => calls.filter((call) => call.table === table),
  }
}

describe('funcionários', () => {
  it('NÃO lê salário nem CPF', async () => {
    const fake = createFakeClient()

    await new SupabaseTeamRepository(fake.client).listEmployees(CLINIC)

    const columns = fake
      .ofTable('employees')
      .find((call) => call.method === 'select')?.args[0] as string

    /*
     * Salário é o dado mais sensível de uma folha, e o produto não tem folha.
     * Trazê-lo para o servidor de aplicação — e daí possivelmente para um log —
     * seria acumular risco de LGPD por uma funcionalidade que ninguém pediu.
     */
    expect(columns).not.toContain('salary_cents')
    expect(columns).not.toContain('cpf')
    expect(columns).toContain('full_name')
  })

  it('cadastra ativo e sem salário', async () => {
    const fake = createFakeClient()

    await new SupabaseTeamRepository(fake.client).createEmployee(CLINIC, {
      fullName: 'Ana Ribeiro',
      roleTitle: 'Recepcionista',
      contractType: 'clt',
      professionalId: null,
      hireDate: null,
    })

    const insert = fake
      .ofTable('employees')
      .find((call) => call.method === 'insert')?.args[0] as Record<
      string,
      unknown
    >

    expect(insert.clinic_id).toBe(CLINIC)
    expect(insert.is_active).toBe(true)
    expect(insert).not.toHaveProperty('salary_cents')
    expect(insert).not.toHaveProperty('cpf')
  })
})

describe('ausências', () => {
  it('nasce pendente', async () => {
    const fake = createFakeClient()

    await new SupabaseTeamRepository(fake.client).createTimeOff(CLINIC, {
      employeeId: EMPLOYEE,
      kind: 'ferias',
      startsOn: new Date(2026, 8, 1),
      endsOn: new Date(2026, 8, 15),
      reason: null,
    })

    const insert = fake
      .ofTable('time_off')
      .find((call) => call.method === 'insert')?.args[0] as Record<
      string,
      unknown
    >

    // Quem pede e quem aprova sao pessoas diferentes.
    expect(insert.status).toBe('requested')
    // `date` do Postgres: sem hora, sem fuso no meio do caminho.
    expect(insert.starts_on).toBe('2026-09-01')
    expect(insert.ends_on).toBe('2026-09-15')
  })

  it('só responde ausência PENDENTE', async () => {
    const fake = createFakeClient()

    await new SupabaseTeamRepository(fake.client).answerTimeOff(
      CLINIC,
      TIME_OFF,
      true,
      USER,
    )

    // Reescrever uma decisao ja tomada apaga quem decidiu e quando — e e esse
    // registro que a clinica precisa se a ausencia virar questionamento.
    expect(fake.ofTable('time_off')).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['status', 'requested'] }),
    )
  })

  it('ausência já respondida não vira sucesso silencioso', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const fake = createFakeClient({ updated: null })

    await expect(
      new SupabaseTeamRepository(fake.client).answerTimeOff(
        CLINIC,
        TIME_OFF,
        false,
        USER,
      ),
    ).rejects.toMatchObject({ reason: 'not-found' })

    spy.mockRestore()
  })

  it('registra quem decidiu', async () => {
    const fake = createFakeClient()

    await new SupabaseTeamRepository(fake.client).answerTimeOff(
      CLINIC,
      TIME_OFF,
      true,
      USER,
    )

    const update = fake
      .ofTable('time_off')
      .find((call) => call.method === 'update')?.args[0] as Record<
      string,
      unknown
    >

    expect(update.status).toBe('approved')
    expect(update.approved_by).toBe(USER)
    expect(update.approved_at).toBeTypeOf('string')
  })

  it('a data lida não recua um dia', async () => {
    const fake = createFakeClient()

    const timeOff = await new SupabaseTeamRepository(fake.client).answerTimeOff(
      CLINIC,
      TIME_OFF,
      true,
      USER,
    )

    /*
     * `new Date('2026-09-01')` interpreta como UTC e, em fuso negativo, exibe
     * 31/08. Uma férias que começa um dia antes do combinado é o tipo de erro
     * que só aparece quando alguém falta.
     */
    expect(timeOff.startsOn.getDate()).toBe(1)
    expect(timeOff.startsOn.getMonth()).toBe(8)
  })
})

describe('createTimeOffSchema', () => {
  it('recusa fim antes do início', () => {
    const result = createTimeOffSchema.safeParse({
      employeeId: EMPLOYEE,
      kind: 'ferias',
      startsOn: '2026-09-15',
      endsOn: '2026-09-01',
    })

    expect(result.success).toBe(false)
  })

  it('aceita ausência de um dia só', () => {
    // Folga e atestado de um dia sao o caso mais comum de todos.
    const result = createTimeOffSchema.safeParse({
      employeeId: EMPLOYEE,
      kind: 'folga',
      startsOn: '2026-09-01',
      endsOn: '2026-09-01',
    })

    expect(result.success).toBe(true)
  })
})

/**
 * Desligamento — feature **S-03**.
 *
 * As duas colunas existiam e nada as escrevia: o cadastro nascia ativo e não
 * havia caminho para desligar ninguém.
 */
describe('desligamento', () => {
  it('grava a data e deriva `is_active` DELA', async () => {
    /*
     * Com dois caminhos independentes existiria a linha "ativo, desligado em
     * 12/03", e nenhuma tela saberia qual das duas afirmações obedecer.
     */
    const fake = createFakeClient({
      employee: employeeRow({ hire_date: '2026-03-01' }),
      updated: employeeRow({
        hire_date: '2026-03-01',
        termination_date: '2026-08-10',
        is_active: false,
      }),
    })

    const employee = await new SupabaseTeamRepository(
      fake.client,
    ).setEmployeeTermination(CLINIC, EMPLOYEE, new Date('2026-08-10T00:00:00'))

    const patch = fake
      .ofTable('employees')
      .find((call) => call.method === 'update')?.args[0] as Record<
      string,
      unknown
    >

    expect(patch.termination_date).toBe('2026-08-10')
    expect(patch.is_active).toBe(false)
    expect(employee.isActive).toBe(false)
  })

  it('reverter apaga a data e devolve a pessoa à equipe', async () => {
    const fake = createFakeClient({
      employee: employeeRow({ termination_date: '2026-08-10', is_active: false }),
      updated: employeeRow(),
    })

    const employee = await new SupabaseTeamRepository(
      fake.client,
    ).setEmployeeTermination(CLINIC, EMPLOYEE, null)

    const patch = fake
      .ofTable('employees')
      .find((call) => call.method === 'update')?.args[0] as Record<
      string,
      unknown
    >

    expect(patch.termination_date).toBeNull()
    expect(patch.is_active).toBe(true)
    expect(employee.terminationDate).toBeNull()
  })

  it('recusa data anterior à admissão sem escrever nada', async () => {
    const fake = createFakeClient({
      employee: employeeRow({ hire_date: '2026-03-01' }),
    })

    await expect(
      new SupabaseTeamRepository(fake.client).setEmployeeTermination(
        CLINIC,
        EMPLOYEE,
        new Date('2026-02-01T00:00:00'),
      ),
    ).rejects.toMatchObject({ reason: 'termination-before-hire' })

    expect(
      fake.ofTable('employees').some((call) => call.method === 'update'),
    ).toBe(false)
  })

  it('recusa data futura sem escrever nada', async () => {
    // Sem worker para virar o vinculo no dia marcado, aceitar o futuro tiraria
    // a pessoa da equipe hoje.
    const fake = createFakeClient({ employee: employeeRow() })
    const future = new Date()
    future.setFullYear(future.getFullYear() + 1)

    await expect(
      new SupabaseTeamRepository(fake.client).setEmployeeTermination(
        CLINIC,
        EMPLOYEE,
        future,
      ),
    ).rejects.toMatchObject({ reason: 'termination-in-future' })

    expect(
      fake.ofTable('employees').some((call) => call.method === 'update'),
    ).toBe(false)
  })

  it('funcionário de outra clínica responde not-found', async () => {
    // Alvo inexistente e alvo de outro inquilino dao no mesmo: a resposta nao
    // pode revelar que o id existe em algum lugar.
    const fake = createFakeClient({ employee: null })

    await expect(
      new SupabaseTeamRepository(fake.client).setEmployeeTermination(
        CLINIC,
        EMPLOYEE,
        new Date('2026-08-10T00:00:00'),
      ),
    ).rejects.toMatchObject({ reason: 'not-found' })
  })

  it('a escrita é escopada em clínica E id', async () => {
    const fake = createFakeClient({ employee: employeeRow() })

    await new SupabaseTeamRepository(fake.client).setEmployeeTermination(
      CLINIC,
      EMPLOYEE,
      new Date('2026-08-10T00:00:00'),
    )

    const filters = fake
      .ofTable('employees')
      .filter((call) => call.method === 'eq')
      .map((call) => call.args)

    expect(filters).toContainEqual(['clinic_id', CLINIC])
    expect(filters).toContainEqual(['id', EMPLOYEE])
  })

  it('linha com desligamento e `is_active` true é lida como DESLIGADA', async () => {
    /*
     * So acontece com linha escrita fora do produto. O desligamento vence:
     * mostrar "Ativo" sobre alguem com data de saida seria a tela
     * contradizendo o banco.
     */
    const fake = createFakeClient({
      updated: employeeRow({ termination_date: '2026-08-10', is_active: true }),
      employee: employeeRow(),
    })

    const employee = await new SupabaseTeamRepository(
      fake.client,
    ).setEmployeeTermination(CLINIC, EMPLOYEE, new Date('2026-08-10T00:00:00'))

    expect(employee.isActive).toBe(false)
  })
})

describe('edicao da admissao', () => {
  it('atualiza a data escopada por clinica e funcionario', async () => {
    const fake = createFakeClient({
      employee: employeeRow({ hire_date: '2026-03-01' }),
      updated: employeeRow({ hire_date: '2026-04-01' }),
    })

    const employee = await new SupabaseTeamRepository(
      fake.client,
    ).updateEmployeeHireDate(CLINIC, EMPLOYEE, new Date('2026-04-01T00:00:00'))

    const patch = fake
      .ofTable('employees')
      .find((call) => call.method === 'update')?.args[0] as Record<
      string,
      unknown
    >

    expect(patch.hire_date).toBe('2026-04-01')
    expect(employee.hireDate?.getDate()).toBe(1)
    expect(fake.ofTable('employees')).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['clinic_id', CLINIC] }),
    )
    expect(fake.ofTable('employees')).toContainEqual(
      expect.objectContaining({ method: 'eq', args: ['id', EMPLOYEE] }),
    )
  })

  it('permite remover a data de um cadastro legado', async () => {
    const fake = createFakeClient({
      employee: employeeRow({ hire_date: '2026-03-01' }),
      updated: employeeRow({ hire_date: null }),
    })

    await new SupabaseTeamRepository(
      fake.client,
    ).updateEmployeeHireDate(CLINIC, EMPLOYEE, null)

    const patch = fake
      .ofTable('employees')
      .find((call) => call.method === 'update')?.args[0] as Record<
      string,
      unknown
    >

    expect(patch.hire_date).toBeNull()
  })

  it('recusa inverter o periodo de um desligado sem escrever', async () => {
    const fake = createFakeClient({
      employee: employeeRow({ termination_date: '2026-08-10' }),
    })

    await expect(
      new SupabaseTeamRepository(fake.client).updateEmployeeHireDate(
        CLINIC,
        EMPLOYEE,
        new Date('2026-09-01T00:00:00'),
      ),
    ).rejects.toMatchObject({ reason: 'hire-after-termination' })

    expect(
      fake.ofTable('employees').some((call) => call.method === 'update'),
    ).toBe(false)
  })
})
