'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { err, ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toInsuranceFailure } from '../application/insuranceFailure'
import { toAuthorizationDto } from '../application/toInsuranceDto'
import { canTransitionAuthorization } from '../domain/Insurance'
import { insuranceRepositoryFor } from '../infrastructure/repository'
import {
  answerAuthorizationSchema,
  transitionAuthorizationSchema,
  type TransitionAuthorizationInput,
  createAuthorizationSchema,
  insuranceMessages,
  type AnswerAuthorizationInput,
  type AuthorizationDto,
  type CreateAuthorizationInput,
} from '../schemas/insurance.schema'

const messages = {
  forbidden: insuranceMessages.forbidden,
  validation: insuranceMessages.invalidFields,
  unavailable: insuranceMessages.unavailable,
  unexpected: insuranceMessages.unexpected,
}

/**
 * Abre a guia — feature **V-01**.
 *
 * `patientId` **não está na entrada**: o adapter o lê da carteirinha. Recebê-lo
 * separado permitiria pedir autorização para um paciente usando a carteirinha de
 * outro — erro que a operadora só recusaria depois, com o atendimento marcado.
 *
 * A guia nasce em `requested` e sem número: o número vem da operadora.
 */
const runCreateAuthorization = createAction<
  CreateAuthorizationInput,
  AuthorizationDto,
  'patientInsuranceId' | 'procedures'
>({
  name: 'insurance.createAuthorization',
  schema: createAuthorizationSchema,
  roles: rolesWith('insurance.manage'),
  messages,
  revalidatePaths: ['/convenios'],

  handler: async (input, context) => {
    const repository = insuranceRepositoryFor(context.supabase)

    try {
      const authorization = await repository.createAuthorization(
        context.clinicId,
        {
          patientInsuranceId: input.patientInsuranceId,
          procedures: input.procedures,
          notes: input.notes,
        },
        context.userId,
      )

      return ok<AuthorizationDto>(toAuthorizationDto(authorization))
    } catch (cause) {
      return toInsuranceFailure<'patientInsuranceId' | 'procedures'>(
        'insurance.createAuthorization',
        cause,
      )
    }
  },

  /**
   * **A descrição dos procedimentos NÃO entra no log.**
   *
   * "Ressonância de coluna lombar" diz o que se investiga num paciente
   * específico, e `audit_log` é legível pela operação inteira e append-only. O
   * que entra é a contagem e o status — suficiente para auditar quem pediu
   * autorização e quando. O conteúdo continua em `insurance_authorizations`.
   */
  audit: (output) => ({
    action: 'insurance_authorization.requested',
    entityType: 'insurance_authorization',
    entityId: output.id,
    after: { status: output.status, procedures: output.procedures.length },
  }),
})

export async function createAuthorizationAction(
  rawInput: unknown,
): Promise<
  ActionResult<AuthorizationDto, 'patientInsuranceId' | 'procedures'>
> {
  return runCreateAuthorization(rawInput)
}

type AnswerField = 'authorizationNumber' | 'denialReason' | 'expiresAt'

/**
 * Registra a resposta da operadora — feature **V-01**.
 *
 * O schema é uma união discriminada: aprovar exige número, negar exige motivo.
 * Campos opcionais aceitariam uma aprovação sem número — que o faturamento
 * rejeita depois, quando o atendimento já aconteceu.
 *
 * O adapter recusa responder guia que já foi respondida: reescrever apagaria o
 * motivo da negativa, que é o texto usado para recorrer.
 */
const runAnswerAuthorization = createAction<
  AnswerAuthorizationInput,
  AuthorizationDto,
  AnswerField
>({
  name: 'insurance.answerAuthorization',
  schema: answerAuthorizationSchema,
  roles: rolesWith('insurance.manage'),
  messages,
  revalidatePaths: ['/convenios'],

  handler: async (input, context) => {
    const repository = insuranceRepositoryFor(context.supabase)

    try {
      const authorization = await repository.answerAuthorization(
        context.clinicId,
        input.authorizationId,
        input.outcome === 'approved'
          ? {
              outcome: 'approved',
              authorizationNumber: input.authorizationNumber,
              expiresAt: parseDate(input.expiresAt),
            }
          : { outcome: 'denied', denialReason: input.denialReason },
      )

      return ok<AuthorizationDto>(toAuthorizationDto(authorization))
    } catch (cause) {
      return toInsuranceFailure<AnswerField>(
        'insurance.answerAuthorization',
        cause,
      )
    }
  },

  /**
   * O motivo da negativa fica na TABELA, não no log.
   *
   * É texto livre da operadora e costuma citar o procedimento — e, por ele, a
   * condição do paciente. O log registra que houve negativa; o porquê vive onde
   * o acesso é controlado.
   */
  audit: (output) => ({
    action: 'insurance_authorization.answered',
    entityType: 'insurance_authorization',
    entityId: output.id,
    after: {
      status: output.status,
      has_number: output.authorizationNumber !== null,
    },
  }),
})

/**
 * Fecha o ciclo da guia — baixar (`used`) ou desistir (`canceled`).
 *
 * Separada de `answerAuthorization` de propósito: responder é da OPERADORA e
 * exige número ou motivo; isto é decisão da CLÍNICA sobre uma guia que já tem
 * (ou já não terá) resposta.
 *
 * A regra vive no domínio e é conferida aqui, no servidor: a tela decide o que
 * OFERECER, e quem chama a action direto não passa por tela nenhuma.
 */
const runTransitionAuthorization = createAction<
  TransitionAuthorizationInput,
  AuthorizationDto,
  'authorizationId' | 'from' | 'to'
>({
  name: 'insurance.transitionAuthorization',
  schema: transitionAuthorizationSchema,
  roles: rolesWith('insurance.manage'),
  messages,
  revalidatePaths: ['/convenios'],

  handler: async (input, context) => {
    if (!canTransitionAuthorization(input.from, input.to)) {
      return err<'authorizationId' | 'from' | 'to'>(
        'validation',
        insuranceMessages.invalidFields,
      )
    }

    try {
      const authorization = await insuranceRepositoryFor(
        context.supabase,
      ).transitionAuthorization(
        context.clinicId,
        input.authorizationId,
        input.from,
        input.to,
      )

      return ok<AuthorizationDto>(toAuthorizationDto(authorization))
    } catch (cause) {
      return toInsuranceFailure<'authorizationId' | 'from' | 'to'>(
        'insurance.transitionAuthorization',
        cause,
      )
    }
  },

  audit: (output) => ({
    action:
      output.status === 'used'
        ? 'insurance.authorization_used'
        : 'insurance.authorization_canceled',
    entityType: 'insurance_authorization',
    entityId: output.id,
    after: { status: output.status },
  }),
})

export async function transitionAuthorizationAction(
  rawInput: unknown,
): Promise<ActionResult<AuthorizationDto, 'authorizationId' | 'from' | 'to'>> {
  return runTransitionAuthorization(rawInput)
}

export async function answerAuthorizationAction(
  rawInput: unknown,
): Promise<ActionResult<AuthorizationDto, AnswerField>> {
  return runAnswerAuthorization(rawInput)
}

/** 'YYYY-MM-DD' -> Date local. Data impossível vira null, não erro. */
function parseDate(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null

  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(year, month - 1, day)

  return parsed.getMonth() === month - 1 && parsed.getDate() === day
    ? parsed
    : null
}
