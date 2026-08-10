'use server'

import { can, rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import type { MembershipRole } from '@/lib/supabase/database.types'
import { err, ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toServiceFailure } from '../application/serviceFailure'
import { toServiceDto } from '../application/toServiceDto'
import { findSameCode } from '../domain/Service'
import { serviceRepositoryFor } from '../infrastructure/repository'
import {
  createServiceSchema,
  deleteServiceSchema,
  serviceMessages,
  setServiceActiveSchema,
  updateServiceSchema,
  type CreateServiceInput,
  type DeleteServiceInput,
  type ServiceDto,
  type ServiceFormValues,
  type SetServiceActiveInput,
  type UpdateServiceInput,
} from '../schemas/service.schema'

type WriteFields =
  | 'name'
  | 'code'
  | 'tussCode'
  | 'category'
  | 'description'
  | 'defaultDurationMinutes'
  | 'defaultPriceCents'
  | 'requiresAuthorization'

/*
 * Todas as escritas exigem `clinic.settings`.
 *
 * O catálogo define o que a clínica oferece e por quanto — a mesma natureza do
 * horário de funcionamento e dos dados cadastrais. Quem agenda e quem fatura
 * CONSOMEM a tabela; alterá-la muda o preço para todo mundo.
 */
const WRITE_ROLES = rolesWith('clinic.settings')

/**
 * Quem pode ver preço decide-se pelo PAPEL DA SESSÃO, nunca pela action.
 *
 * A primeira versão passava `true` fixo aqui, com o argumento de que quem
 * escreve acabou de digitar o valor. O argumento é falso em dois pontos:
 *
 *  1. `clinic.settings` e `invoice.read` são permissões distintas. Hoje os dois
 *     papéis que têm a primeira também têm a segunda, mas isso é um acidente da
 *     matriz atual — mudá-la faria o preço vazar sem que nada aqui quebrasse.
 *  2. A action é EXPORTADA. Quem a chama direto não passa pela tela, e
 *     `service.update` devolve o registro inteiro: bastaria alterar o nome de um
 *     serviço para receber de volta o preço dele.
 *
 * `context.role` vem do banco, resolvido pelo `createAction` — nunca do cliente.
 */
function canSeePriceIn(context: { role: MembershipRole | null }): boolean {
  return can(context.role, 'invoice.read')
}

const runCreateService = createAction<CreateServiceInput, ServiceDto, WriteFields>({
  name: 'service.create',
  schema: createServiceSchema,
  roles: WRITE_ROLES,
  messages: {
    validation: serviceMessages.invalidFields,
    unavailable: serviceMessages.unavailable,
    unexpected: serviceMessages.unexpected,
  },
  revalidatePaths: ['/servicos'],
  handler: async (input, context) => {
    try {
      const repository = serviceRepositoryFor(context.supabase)

      /*
       * A checagem de código repetido roda no SERVIDOR, sobre a lista lida do
       * banco — nunca sobre o que a tela mostrava. Dois serviços com o mesmo
       * código deixam quem fatura sem saber qual valor vale.
       */
      const existing = await repository.list(context.clinicId)
      if (findSameCode(existing, input.code)) {
        return err<WriteFields>('conflict', serviceMessages.duplicateCode)
      }

      const service = await repository.create(context.clinicId, input)
      return ok(toServiceDto(service, canSeePriceIn(context)))
    } catch (cause) {
      return toServiceFailure<WriteFields>('service.create', cause)
    }
  },
  /*
   * O preço vem do INPUT, e não do DTO devolvido.
   *
   * O DTO agora omite o valor para quem não tem `invoice.read`, e a trilha
   * precisa registrar o que foi GRAVADO — não o que o autor podia ver.
   * `input` já passou pelo Zod e é exatamente o que o repositório persistiu.
   * `audit_log` tem a própria permissão de leitura (`audit.read`).
   */
  audit: (output, input) => ({
    action: 'service.created',
    entityType: 'service',
    entityId: output.id,
    after: { name: input.name, code: input.code, price_cents: input.defaultPriceCents },
  }),
})

const runUpdateService = createAction<
  UpdateServiceInput,
  ServiceDto,
  WriteFields | 'serviceId'
>({
  name: 'service.update',
  schema: updateServiceSchema,
  roles: WRITE_ROLES,
  messages: {
    validation: serviceMessages.invalidFields,
    unavailable: serviceMessages.unavailable,
    unexpected: serviceMessages.unexpected,
  },
  revalidatePaths: ['/servicos'],
  handler: async (input, context) => {
    const { serviceId, ...data } = input
    try {
      const repository = serviceRepositoryFor(context.supabase)

      // A própria linha não conta como duplicata: trocar "cons01" por "CONS01"
      // não pode colidir consigo mesma.
      const existing = await repository.list(context.clinicId)
      if (findSameCode(existing, data.code, serviceId)) {
        return err<WriteFields | 'serviceId'>('conflict', serviceMessages.duplicateCode)
      }

      const service = await repository.update(context.clinicId, serviceId, data)
      return ok(toServiceDto(service, canSeePriceIn(context)))
    } catch (cause) {
      return toServiceFailure<WriteFields | 'serviceId'>('service.update', cause)
    }
  },
  // Mesma razão do `create`: a trilha registra o que foi gravado.
  audit: (output, input) => ({
    action: 'service.updated',
    entityType: 'service',
    entityId: output.id,
    after: { name: input.name, code: input.code, price_cents: input.defaultPriceCents },
  }),
})

const runSetServiceActive = createAction<
  SetServiceActiveInput,
  ServiceDto,
  'serviceId' | 'isActive'
>({
  name: 'service.set_active',
  schema: setServiceActiveSchema,
  roles: WRITE_ROLES,
  messages: {
    validation: serviceMessages.invalidFields,
    unavailable: serviceMessages.unavailable,
    unexpected: serviceMessages.unexpected,
  },
  revalidatePaths: ['/servicos'],
  handler: async (input, context) => {
    try {
      const service = await serviceRepositoryFor(context.supabase).setActive(
        context.clinicId,
        input.serviceId,
        input.isActive,
      )
      return ok(toServiceDto(service, canSeePriceIn(context)))
    } catch (cause) {
      return toServiceFailure<'serviceId' | 'isActive'>('service.set_active', cause)
    }
  },
  audit: (output) => ({
    action: output.isActive ? 'service.activated' : 'service.deactivated',
    entityType: 'service',
    entityId: output.id,
    after: { is_active: output.isActive },
  }),
})

/**
 * Exclusão LÓGICA — a linha permanece no banco.
 *
 * `invoice_items.service_id` pode apontar para ela, e apagar de verdade
 * deixaria faturas antigas sem saber o que foi cobrado.
 */
const runDeleteService = createAction<DeleteServiceInput, { id: string }, 'serviceId'>({
  name: 'service.delete',
  schema: deleteServiceSchema,
  roles: WRITE_ROLES,
  messages: {
    validation: serviceMessages.invalidFields,
    unavailable: serviceMessages.unavailable,
    unexpected: serviceMessages.unexpected,
  },
  revalidatePaths: ['/servicos'],
  handler: async (input, context) => {
    try {
      await serviceRepositoryFor(context.supabase).softDelete(
        context.clinicId,
        input.serviceId,
      )
      return ok({ id: input.serviceId })
    } catch (cause) {
      return toServiceFailure<'serviceId'>('service.delete', cause)
    }
  },
  audit: (output) => ({
    action: 'service.deleted',
    entityType: 'service',
    entityId: output.id,
  }),
})

export async function createServiceAction(
  rawInput: unknown,
): Promise<ActionResult<ServiceDto, WriteFields>> {
  return runCreateService(rawInput)
}

export async function updateServiceAction(
  rawInput: unknown,
): Promise<ActionResult<ServiceDto, WriteFields | 'serviceId'>> {
  return runUpdateService(rawInput)
}

export async function submitServiceFromScreen(
  values: ServiceFormValues,
  serviceId: string | null,
): Promise<string | null> {
  const payload = {
    ...values,
    defaultDurationMinutes: values.defaultDurationMinutes,
  }
  const result = serviceId
    ? await runUpdateService({ serviceId, ...payload })
    : await runCreateService(payload)
  return result.ok ? null : result.error.message
}

export async function setServiceActiveFromScreen(
  serviceId: string,
  isActive: boolean,
): Promise<string | null> {
  const result = await runSetServiceActive({ serviceId, isActive })
  return result.ok ? null : result.error.message
}

export async function deleteServiceFromScreen(serviceId: string): Promise<string | null> {
  const result = await runDeleteService({ serviceId })
  return result.ok ? null : result.error.message
}
