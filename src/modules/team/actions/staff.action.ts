'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toTeamFailure } from '../application/teamFailure'
import { teamRepositoryFor } from '../infrastructure/repository'
import {
  answerTimeOffSchema,
  createEmployeeSchema,
  createTimeOffSchema,
  teamMessages,
  type AnswerTimeOffInput,
  type CreateEmployeeInput,
  type CreateTimeOffInput,
  type EmployeeDto,
  type TimeOffDto,
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
      })

      return ok<EmployeeDto>({
        id: employee.id,
        fullName: employee.fullName,
        roleTitle: employee.roleTitle,
        contractType: employee.contractType,
        isActive: employee.isActive,
      })
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
