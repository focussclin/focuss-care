'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toTeamFailure } from '../application/teamFailure'
import type { Employee } from '../domain/Employee'
import { teamRepositoryFor } from '../infrastructure/repository'
import {
  answerTimeOffSchema,
  createEmployeeSchema,
  createTimeOffSchema,
  reinstateEmployeeSchema,
  teamMessages,
  terminateEmployeeSchema,
  updateEmployeeHireDateSchema,
  type AnswerTimeOffInput,
  type CreateEmployeeInput,
  type CreateTimeOffInput,
  type EmployeeDto,
  type ReinstateEmployeeInput,
  type TerminateEmployeeInput,
  type TimeOffDto,
  type UpdateEmployeeHireDateInput,
} from '../schemas/team.schema'

/**
 * Vínculo trabalhista e ausências — feature **S-02**.
 *
 * As três operações exigem `team.manage`, e não `team.read`: cadastrar
 * funcionário e decidir sobre férias são atos de gestão, não consulta. Quem
 * atende vê a equipe; quem administra registra o vínculo.
 *
 * **Não há ação de escala.** `work_schedules.weekday` é um número sem convenção
 * verificável (bloqueio P-WD) — ver o fim de `TeamRepository`.
 */

const messages = {
  forbidden: teamMessages.forbidden,
  validation: teamMessages.invalidFields,
  unavailable: teamMessages.unavailable,
  unexpected: teamMessages.unexpected,
}

const runCreateEmployee = createAction<
  CreateEmployeeInput,
  EmployeeDto,
  'fullName' | 'contractType'
>({
  name: 'employee.create',
  schema: createEmployeeSchema,
  roles: rolesWith('team.manage'),
  messages,
  revalidatePaths: ['/equipe'],

  handler: async (input, context) => {
    const repository = teamRepositoryFor(context.supabase)

    try {
      const employee = await repository.createEmployee(context.clinicId, {
        fullName: input.fullName,
        roleTitle: input.roleTitle,
        contractType: input.contractType,
        professionalId: input.professionalId,
        hireDate: input.hireDate ? new Date(`${input.hireDate}T00:00:00`) : null,
      })

      return ok<EmployeeDto>(toEmployeeDto(employee))
    } catch (cause) {
      return toTeamFailure<'fullName' | 'contractType'>('employee.create', cause)
    }
  },

  /**
   * **O nome do funcionário NÃO entra no log.**
   *
   * É dado pessoal, e `audit_log` é legível pela operação inteira e
   * append-only. O que entra é o tipo de contrato — informação de gestão, sem
   * pessoa identificada.
   */
  audit: (output) => ({
    action: 'employee.created',
    entityType: 'employee',
    entityId: output.id,
    after: { contract_type: output.contractType },
  }),
})

export async function createEmployeeAction(
  rawInput: unknown,
): Promise<ActionResult<EmployeeDto, 'fullName' | 'contractType'>> {
  return runCreateEmployee(rawInput)
}

/**
 * Desligamento — feature **S-03**.
 *
 * # Por que duas actions, e um método só no repositório
 *
 * Desligar e reverter são a mesma escrita (a data, e o `is_active` que sai
 * dela) e **dois atos diferentes** na trilha. `audit_log` é lido por pergunta —
 * "quem desligou quem, e quando" —, e um evento único com a data dentro faria a
 * reversão parecer um desligamento com data nula.
 *
 * A regra da data é conferida no adapter, junto da escrita: recusar desligamento
 * anterior à admissão exige conhecer a admissão, e ela está na linha.
 */
const runTerminateEmployee = createAction<
  TerminateEmployeeInput,
  EmployeeDto,
  'terminationDate'
>({
  name: 'employee.terminate',
  schema: terminateEmployeeSchema,
  roles: rolesWith('team.manage'),
  messages,
  revalidatePaths: ['/equipe'],

  handler: async (input, context) => {
    const repository = teamRepositoryFor(context.supabase)

    try {
      const employee = await repository.setEmployeeTermination(
        context.clinicId,
        input.employeeId,
        new Date(`${input.terminationDate}T00:00:00`),
      )

      return ok<EmployeeDto>(toEmployeeDto(employee))
    } catch (cause) {
      return toTeamFailure<'terminationDate'>('employee.terminate', cause)
    }
  },

  /**
   * A DATA entra; o nome, não.
   *
   * Data de desligamento é informação de gestão e é o que a pergunta da trilha
   * precisa. O nome é dado pessoal, e `audit_log` é append-only e legível pela
   * operação inteira — mesma regra de `employee.created`.
   */
  audit: (output) => ({
    action: 'employee.terminated',
    entityType: 'employee',
    entityId: output.id,
    after: { termination_date: output.terminationDate },
  }),
})

export async function terminateEmployeeAction(
  rawInput: unknown,
): Promise<ActionResult<EmployeeDto, 'terminationDate'>> {
  return runTerminateEmployee(rawInput)
}

/**
 * Reverter o desligamento.
 *
 * Não é readmissão: é o conserto de um registro errado. A data de admissão
 * permanece, porque o vínculo é o mesmo — uma recontratação de verdade é outro
 * cadastro, com outro período.
 */
const runReinstateEmployee = createAction<
  ReinstateEmployeeInput,
  EmployeeDto,
  'employeeId'
>({
  name: 'employee.reinstate',
  schema: reinstateEmployeeSchema,
  roles: rolesWith('team.manage'),
  messages,
  revalidatePaths: ['/equipe'],

  handler: async (input, context) => {
    const repository = teamRepositoryFor(context.supabase)

    try {
      const employee = await repository.setEmployeeTermination(
        context.clinicId,
        input.employeeId,
        null,
      )

      return ok<EmployeeDto>(toEmployeeDto(employee))
    } catch (cause) {
      return toTeamFailure<'employeeId'>('employee.reinstate', cause)
    }
  },

  audit: (output) => ({
    action: 'employee.reinstated',
    entityType: 'employee',
    entityId: output.id,
    after: { contract_type: output.contractType },
  }),
})

export async function reinstateEmployeeAction(
  rawInput: unknown,
): Promise<ActionResult<EmployeeDto, 'employeeId'>> {
  return runReinstateEmployee(rawInput)
}

/**
 * Corrige a data de admissao sem criar outro funcionario.
 *
 * O campo vazio remove a data de cadastros legados. A regra de ordem com um
 * desligamento existente continua no repositorio, junto da leitura que evita
 * decidir sobre um estado antigo.
 */
const runUpdateEmployeeHireDate = createAction<
  UpdateEmployeeHireDateInput,
  EmployeeDto,
  'employeeId' | 'hireDate'
>({
  name: 'employee.hire_date.update',
  schema: updateEmployeeHireDateSchema,
  roles: rolesWith('team.manage'),
  messages,
  revalidatePaths: ['/equipe'],

  handler: async (input, context) => {
    const repository = teamRepositoryFor(context.supabase)

    try {
      const employee = await repository.updateEmployeeHireDate(
        context.clinicId,
        input.employeeId,
        input.hireDate ? parseDateOnly(input.hireDate) : null,
      )

      return ok<EmployeeDto>(toEmployeeDto(employee))
    } catch (cause) {
      return toTeamFailure<'employeeId' | 'hireDate'>(
        'employee.hire_date.update',
        cause,
      )
    }
  },

  audit: (output) => ({
    action: 'employee.hire_date_updated',
    entityType: 'employee',
    entityId: output.id,
    after: { hire_date: output.hireDate },
  }),
})

export async function updateEmployeeHireDateAction(
  rawInput: unknown,
): Promise<ActionResult<EmployeeDto, 'employeeId' | 'hireDate'>> {
  return runUpdateEmployeeHireDate(rawInput)
}

/**
 * Entidade -> o que atravessa a fronteira.
 *
 * Um lugar só para as três actions de vínculo: com uma cópia por action, a
 * primeira a ganhar um campo novo deixaria as outras devolvendo uma forma
 * diferente para a mesma tela.
 */
function toEmployeeDto(employee: Employee): EmployeeDto {
  return {
    id: employee.id,
    fullName: employee.fullName,
    roleTitle: employee.roleTitle,
    contractType: employee.contractType,
    isActive: employee.isActive,
    hireDate: employee.hireDate ? toIsoDay(employee.hireDate) : null,
    terminationDate: employee.terminationDate
      ? toIsoDay(employee.terminationDate)
      : null,
  }
}

/** 'YYYY-MM-DD' no fuso local — a data é dia de calendário, não instante. */
function toIsoDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${date.getFullYear()}-${month}-${day}`
}

type TimeOffField = 'employeeId' | 'startsOn' | 'endsOn'

const runCreateTimeOff = createAction<
  CreateTimeOffInput,
  TimeOffDto,
  TimeOffField
>({
  name: 'timeOff.create',
  schema: createTimeOffSchema,
  roles: rolesWith('team.manage'),
  messages,
  revalidatePaths: ['/equipe'],

  handler: async (input, context) => {
    const repository = teamRepositoryFor(context.supabase)

    try {
      const timeOff = await repository.createTimeOff(context.clinicId, {
        employeeId: input.employeeId,
        kind: input.kind,
        startsOn: parseDateOnly(input.startsOn),
        endsOn: parseDateOnly(input.endsOn),
        reason: input.reason,
      })

      return ok<TimeOffDto>(toDto(timeOff))
    } catch (cause) {
      return toTeamFailure<TimeOffField>('timeOff.create', cause)
    }
  },

  /**
   * **O motivo NÃO entra no log**, e é a decisão mais importante deste arquivo.
   *
   * Em atestado e licença, `reason` costuma dizer a condição de saúde da
   * pessoa. Isso é dado de saúde de um trabalhador, e `audit_log` é append-only
   * e legível pela operação inteira — o que entra ali não sai mais. O evento
   * registra o TIPO de ausência, que já é informação de gestão suficiente.
   */
  audit: (output) => ({
    action: 'time_off.requested',
    entityType: 'time_off',
    entityId: output.id,
    after: { kind: output.kind, status: output.status },
  }),
})

export async function createTimeOffAction(
  rawInput: unknown,
): Promise<ActionResult<TimeOffDto, TimeOffField>> {
  return runCreateTimeOff(rawInput)
}

const runAnswerTimeOff = createAction<AnswerTimeOffInput, TimeOffDto, 'timeOffId'>(
  {
    name: 'timeOff.answer',
    schema: answerTimeOffSchema,
    roles: rolesWith('team.manage'),
    messages,
    revalidatePaths: ['/equipe'],

    handler: async (input, context) => {
      const repository = teamRepositoryFor(context.supabase)

      try {
        const timeOff = await repository.answerTimeOff(
          context.clinicId,
          input.timeOffId,
          input.approved,
          context.userId,
        )

        return ok<TimeOffDto>(toDto(timeOff))
      } catch (cause) {
        return toTeamFailure<'timeOffId'>('timeOff.answer', cause)
      }
    },

    /** Quem decidiu sai da sessão, pelo `recordAuditEvent`. */
    audit: (output) => ({
      action: 'time_off.answered',
      entityType: 'time_off',
      entityId: output.id,
      after: { status: output.status },
    }),
  },
)

export async function answerTimeOffAction(
  rawInput: unknown,
): Promise<ActionResult<TimeOffDto, 'timeOffId'>> {
  return runAnswerTimeOff(rawInput)
}

function toDto(timeOff: {
  id: string
  employeeName: string
  kind: string
  status: string
  startsOn: Date
  endsOn: Date
  answeredAt: Date | null
}): TimeOffDto {
  return {
    id: timeOff.id,
    employeeName: timeOff.employeeName,
    kind: timeOff.kind,
    status: timeOff.status,
    startsOn: timeOff.startsOn.toISOString(),
    endsOn: timeOff.endsOn.toISOString(),
    answeredAt: timeOff.answeredAt?.toISOString() ?? null,
  }
}

/** 'YYYY-MM-DD' -> Date local. O schema já garantiu o formato. */
function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}
