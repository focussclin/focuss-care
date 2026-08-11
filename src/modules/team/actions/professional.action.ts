'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { limitReachedMessage } from '@/lib/subscription/plan-limits'
import { hasQuotaFor } from '@/lib/subscription/plan-quota'
import { createAction } from '@/modules/_shared/application/createAction'
import type { ActionContext } from '@/modules/_shared/application/createAction'
import { err, ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toProfessionalFailure } from '../application/professionalFailure'
import { toProfessionalDto } from '../application/toProfessionalDto'
import type { NewProfessionalData } from '../domain/Professional'
import { professionalRepositoryFor } from '../infrastructure/professional-repository'
import {
  createProfessionalSchema,
  professionalMessages,
  setProfessionalActiveSchema,
  updateProfessionalSchema,
  type CreateProfessionalInput,
  type ProfessionalDto,
  type SetProfessionalActiveInput,
  type UpdateProfessionalInput,
} from '../schemas/professional.schema'

/**
 * Cadastro de profissionais — o pré-requisito que faltava.
 *
 * `professionals` era lida por agenda, prontuário, prescrição e assinatura, e
 * escrita por ninguém: a única forma de existir um profissional era alguém
 * inserir a linha direto no banco.
 *
 * # `team.manage`, e não `team.read`
 *
 * Cadastrar quem atende é ato de gestão. Mais que isso: vincular um usuário a um
 * profissional é o que faz `current_professional_id()` resolver, e a partir daí
 * essa pessoa assina prontuário e prescrição. Quem consulta a equipe não decide
 * quem pode assinar.
 */
const WRITE_ROLES = rolesWith('team.manage')

const messages = {
  forbidden: professionalMessages.forbidden,
  validation: professionalMessages.invalidFields,
  unavailable: professionalMessages.unavailable,
  unexpected: professionalMessages.unexpected,
}

/**
 * As duas telas que mudam quando um profissional entra, sai ou muda de nome.
 *
 * `/agenda` entra porque o seletor de profissional do novo atendimento vem de
 * `professionals` com `is_active = true` — desativar alguém sem revalidar a
 * agenda deixaria o nome disponível para marcar até o cache expirar.
 */
const REVALIDATE = ['/equipe', '/agenda'] as const

type ProfessionalField =
  | 'displayName'
  | 'councilNumber'
  | 'councilState'
  | 'specialties'
  | 'defaultSlotMinutes'
  | 'userId'

/**
 * O usuário escolhido pertence a ESTA clínica?
 *
 * `professionals.user_id` referencia `profiles.id` — coluna única. O banco
 * aceita qualquer usuário existente, de qualquer clínica, e a RLS de
 * `professionals` protege a LINHA (`clinic_id`), não o conteúdo do campo. Sem
 * esta guarda, um administrador poderia apontar o cadastro para alguém de fora
 * e, com isso, dar a essa pessoa a assinatura clínica daqui — é o mesmo buraco
 * das FKs de coluna única que já foi fechado em vitals e prescrições.
 *
 * Devolve a falha pronta quando o vínculo não pode ser aceito, e `null` quando
 * pode seguir.
 */
async function rejectForeignUser(
  userId: string | null,
  context: ActionContext,
): Promise<ActionResult<never, ProfessionalField> | null> {
  if (!userId) return null

  const belongs = await professionalRepositoryFor(context.supabase).userBelongsToClinic(
    context.clinicId,
    userId,
  )

  if (belongs) return null

  console.error('[professional] vínculo recusado: usuário fora da clínica', {
    clinicId: context.clinicId,
  })

  return err<ProfessionalField>('validation', professionalMessages.userNotInClinic, {
    userId: professionalMessages.userNotInClinic,
  })
}

function toData(
  input: CreateProfessionalInput | UpdateProfessionalInput,
): NewProfessionalData {
  return {
    displayName: input.displayName,
    councilType: input.councilType,
    councilNumber: input.councilNumber,
    councilState: input.councilState,
    specialties: input.specialties,
    defaultSlotMinutes: input.defaultSlotMinutes,
    userId: input.userId,
    /*
     * `agenda_color` nasce nula e continua nula: nenhuma tela a lê, e escolher
     * um formato — hexadecimal, token do tema, nome CSS — seria inventar uma
     * convenção que ninguém declarou. Ver `colorUnavailable`.
     */
    agendaColor: null,
  }
}

const runCreate = createAction<CreateProfessionalInput, ProfessionalDto, ProfessionalField>({
  name: 'professional.create',
  schema: createProfessionalSchema,
  roles: WRITE_ROLES,
  messages,
  revalidatePaths: [...REVALIDATE],
  handler: async (input, context) => {
    const rejected = await rejectForeignUser(input.userId, context)
    if (rejected) return rejected

    /*
     * Limite do PLANO, antes de escrever.
     *
     * A cota conta profissional ATIVO — a mesma conta de `/assinaturas`. Por
     * isso reativar tambem passa por aqui (ver `runSetActive`): sem isso,
     * desativar e reativar seria o caminho para furar o limite sem cadastrar
     * ninguem novo.
     */
    const quota = await hasQuotaFor(
      context.supabase,
      context.clinicId,
      'professionals',
    )
    if (!quota.allowed && quota.max !== null) {
      return err<ProfessionalField>(
        'conflict',
        limitReachedMessage('professionals', quota.max),
      )
    }

    try {
      const professional = await professionalRepositoryFor(context.supabase).create(
        context.clinicId,
        toData(input),
      )
      return ok(toProfessionalDto(professional))
    } catch (cause) {
      return toProfessionalFailure<ProfessionalField>('professional.create', cause)
    }
  },
  /**
   * O nome NÃO entra na trilha — é dado pessoal, e `audit_log` é append-only e
   * legível pela operação inteira. O que entra é o que muda o alcance de quem
   * assina: houve vínculo com usuário, e sob qual conselho a pessoa atende.
   */
  audit: (output) => ({
    action: 'professional.created',
    entityType: 'professional',
    entityId: output.id,
    after: {
      council_type: output.councilType,
      linked_user: output.linkedUserId !== null,
      can_sign: output.canSign,
    },
  }),
})

const runUpdate = createAction<UpdateProfessionalInput, ProfessionalDto, ProfessionalField>({
  name: 'professional.update',
  schema: updateProfessionalSchema,
  roles: WRITE_ROLES,
  messages,
  revalidatePaths: [...REVALIDATE],
  handler: async (input, context) => {
    const rejected = await rejectForeignUser(input.userId, context)
    if (rejected) return rejected

    try {
      const professional = await professionalRepositoryFor(context.supabase).update(
        context.clinicId,
        input.professionalId,
        toData(input),
      )
      return ok(toProfessionalDto(professional))
    } catch (cause) {
      return toProfessionalFailure<ProfessionalField>('professional.update', cause)
    }
  },
  audit: (output) => ({
    action: 'professional.updated',
    entityType: 'professional',
    entityId: output.id,
    after: {
      council_type: output.councilType,
      linked_user: output.linkedUserId !== null,
      can_sign: output.canSign,
    },
  }),
})

/**
 * Ativar e desativar é ação própria, com botão próprio.
 *
 * Desativar tira o profissional do seletor da agenda de toda a clínica e
 * derruba a assinatura dele. Escondido como checkbox num formulário de nome e
 * conselho, o efeito passaria despercebido atrás de um "salvar".
 *
 * **Não há exclusão.** `medical_records.author_id` e `prescriptions.author_id`
 * apontam para cá: apagar o profissional apagaria a autoria de prontuário, que
 * tem prazo legal de guarda.
 */
const runSetActive = createAction<
  SetProfessionalActiveInput,
  ProfessionalDto,
  'professionalId' | 'isActive'
>({
  name: 'professional.set_active',
  schema: setProfessionalActiveSchema,
  roles: WRITE_ROLES,
  messages,
  revalidatePaths: [...REVALIDATE],
  handler: async (input, context) => {
    /*
     * Reativar consome cota; desativar libera.
     *
     * A conta de `/assinaturas` e de profissional ATIVO. Sem esta guarda,
     * desativar e reativar seria o caminho para furar o limite sem cadastrar
     * ninguem novo — e o furo nao apareceria em lugar nenhum, porque o total
     * cadastrado continuaria igual.
     */
    if (input.isActive) {
      const quota = await hasQuotaFor(
        context.supabase,
        context.clinicId,
        'professionals',
      )
      if (!quota.allowed && quota.max !== null) {
        return err<'professionalId' | 'isActive'>(
          'conflict',
          limitReachedMessage('professionals', quota.max),
        )
      }
    }

    try {
      const professional = await professionalRepositoryFor(context.supabase).setActive(
        context.clinicId,
        input.professionalId,
        input.isActive,
      )
      return ok(toProfessionalDto(professional))
    } catch (cause) {
      return toProfessionalFailure<'professionalId' | 'isActive'>(
        'professional.set_active',
        cause,
      )
    }
  },
  audit: (output) => ({
    action: output.isActive ? 'professional.activated' : 'professional.deactivated',
    entityType: 'professional',
    entityId: output.id,
    after: { is_active: output.isActive, can_sign: output.canSign },
  }),
})

export async function createProfessionalAction(
  rawInput: unknown,
): Promise<ActionResult<ProfessionalDto, ProfessionalField>> {
  return runCreate(rawInput)
}

export async function updateProfessionalAction(
  rawInput: unknown,
): Promise<ActionResult<ProfessionalDto, ProfessionalField>> {
  return runUpdate(rawInput)
}

export async function setProfessionalActiveAction(
  rawInput: unknown,
): Promise<ActionResult<ProfessionalDto, 'professionalId' | 'isActive'>> {
  return runSetActive(rawInput)
}
