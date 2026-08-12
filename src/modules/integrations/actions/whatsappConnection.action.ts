'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { err, ok, type ActionResult } from '@/modules/_shared/domain/Result'

import {
  isWhatsappGatewayError,
  type WhatsappConnection,
} from '../domain/WhatsappConnection'
import { saveConnectedChannel } from '../infrastructure/whatsapp-channel'
import { whatsappGatewayFor } from '../infrastructure/whatsapp-gateway'
import {
  whatsappConnectionMessages,
  whatsappConnectionSchema,
  type WhatsappConnectionDto,
  type WhatsappConnectionInput,
} from '../schemas/whatsappConnection.schema'

/**
 * Conexão do canal de WhatsApp pela Evolution API.
 *
 * # O QR não é auditado, o pedido é
 *
 * `audit_log` é append-only e legível por `audit.read`. Um QR gravado ali seria
 * uma credencial de pareamento guardada em texto, alcançável por quem nunca
 * deveria conectar o canal. O evento diz QUEM pediu conexão e em que estado ela
 * ficou — nunca o código.
 */

function toDto(connection: WhatsappConnection): WhatsappConnectionDto {
  return {
    state: connection.state,
    qrCode: connection.qrCode,
    phoneNumber: connection.phoneNumber,
  }
}

function toFailure(cause: unknown): ActionResult<never, never> {
  if (isWhatsappGatewayError(cause)) {
    /*
     * Só `reason` vai para o log. A mensagem do provedor pode ecoar o payload
     * enviado, e o payload carrega a chave da instância.
     */
    console.error('[whatsapp] gateway recusou', { reason: cause.reason })

    switch (cause.reason) {
      case 'not-configured':
        return err('validation', whatsappConnectionMessages.notConfigured)
      case 'unauthorized':
        return err('forbidden', whatsappConnectionMessages.unauthorized)
      case 'unavailable':
        return err('unavailable', whatsappConnectionMessages.unavailable)
      case 'unexpected':
        return err('unexpected', whatsappConnectionMessages.unexpected)
    }
  }

  console.error('[whatsapp] falha nao tratada', {
    kind: cause instanceof Error ? cause.name : typeof cause,
  })

  return err('unexpected', whatsappConnectionMessages.unexpected)
}

const runConnect = createAction<WhatsappConnectionInput, WhatsappConnectionDto>({
  name: 'whatsapp.connect',
  schema: whatsappConnectionSchema,
  // Conectar o canal é ato de configuração da clínica: o número que sai nas
  // mensagens passa a ser o pareado aqui.
  roles: rolesWith('clinic.settings'),
  messages: {
    forbidden: whatsappConnectionMessages.forbidden,
    unavailable: whatsappConnectionMessages.unavailable,
    unexpected: whatsappConnectionMessages.unexpected,
  },
  revalidatePaths: ['/whatsapp'],

  handler: async (_input, context) => {
    try {
      const gateway = await whatsappGatewayFor(context.supabase, context.clinicId)
      const connection = await gateway.connect(
        await instanceNameOf(context.supabase, context.clinicId),
      )

      await saveConnectedChannel(context.supabase, context.clinicId, connection)

      return ok(toDto(connection))
    } catch (cause) {
      return toFailure(cause)
    }
  },

  audit: (output) => ({
    action: 'whatsapp.connect',
    entityType: 'whatsapp_channel',
    entityId: null,
    // `qr_presente` responde "houve código para ler?" sem guardar o código.
    after: { state: output.state, qr_presente: output.qrCode !== null },
  }),
})

const runStatus = createAction<WhatsappConnectionInput, WhatsappConnectionDto>({
  name: 'whatsapp.status',
  schema: whatsappConnectionSchema,
  roles: rolesWith('clinic.settings'),
  messages: {
    forbidden: whatsappConnectionMessages.forbidden,
    unavailable: whatsappConnectionMessages.unavailable,
    unexpected: whatsappConnectionMessages.unexpected,
  },

  handler: async (_input, context) => {
    try {
      const gateway = await whatsappGatewayFor(context.supabase, context.clinicId)
      const connection = await gateway.status(
        await instanceNameOf(context.supabase, context.clinicId),
      )

      await saveConnectedChannel(context.supabase, context.clinicId, connection)

      return ok(toDto(connection))
    } catch (cause) {
      return toFailure(cause)
    }
  },

  /*
   * Consulta de estado NÃO audita.
   *
   * A tela pergunta a cada poucos segundos enquanto o QR está na tela; auditar
   * cada volta encheria a trilha de ruído e esconderia o evento que importa, que
   * é a conexão em si.
   */
  audit: () => null,
})

const runDisconnect = createAction<WhatsappConnectionInput, WhatsappConnectionDto>({
  name: 'whatsapp.disconnect',
  schema: whatsappConnectionSchema,
  roles: rolesWith('clinic.settings'),
  messages: {
    forbidden: whatsappConnectionMessages.forbidden,
    unavailable: whatsappConnectionMessages.unavailable,
    unexpected: whatsappConnectionMessages.unexpected,
  },
  revalidatePaths: ['/whatsapp'],

  handler: async (_input, context) => {
    try {
      const gateway = await whatsappGatewayFor(context.supabase, context.clinicId)
      const instanceName = await instanceNameOf(context.supabase, context.clinicId)

      await gateway.disconnect(instanceName)
      await saveConnectedChannel(context.supabase, context.clinicId, {
        instanceName,
        state: 'disconnected',
        qrCode: null,
        phoneNumber: null,
      })

      return ok<WhatsappConnectionDto>({
        state: 'disconnected',
        qrCode: null,
        phoneNumber: null,
      })
    } catch (cause) {
      return toFailure(cause)
    }
  },

  audit: () => ({
    action: 'whatsapp.disconnect',
    entityType: 'whatsapp_channel',
    entityId: null,
    after: { state: 'disconnected' },
  }),
})

/**
 * O nome da instância sai do cofre, nunca da entrada.
 *
 * Fica numa função à parte porque as três actions precisam dele e a leitura do
 * cofre é a operação que este módulo mais restringe.
 */
async function instanceNameOf(
  client: Parameters<typeof whatsappGatewayFor>[0],
  clinicId: string,
): Promise<string> {
  const { whatsappInstanceName } = await import('../infrastructure/whatsapp-gateway')
  const name = await whatsappInstanceName(client, clinicId)

  if (!name) {
    const { WhatsappGatewayError } = await import('../domain/WhatsappConnection')
    throw new WhatsappGatewayError(
      'not-configured',
      'instancia da Evolution API nao cadastrada nesta clinica',
    )
  }

  return name
}

export async function connectWhatsappAction(): Promise<
  ActionResult<WhatsappConnectionDto>
> {
  return runConnect({})
}

export async function whatsappStatusAction(): Promise<
  ActionResult<WhatsappConnectionDto>
> {
  return runStatus({})
}

export async function disconnectWhatsappAction(): Promise<
  ActionResult<WhatsappConnectionDto>
> {
  return runDisconnect({})
}
