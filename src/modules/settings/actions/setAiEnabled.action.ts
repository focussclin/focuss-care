'use server'

import { z } from 'zod'

import { rolesWith } from '@/lib/auth/permissions'
import { cacheTags } from '@/lib/cache/tags'
import { createAction } from '@/modules/_shared/application/createAction'
import { ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toSettingsFailure } from '../application/settingsFailure'
import { clinicSettingsRepositoryFor } from '../infrastructure/repository'
import { settingsMessages } from '../schemas/settings.schema'

/**
 * Autoriza — ou revoga — a IA a responder paciente pelo WhatsApp da clínica.
 *
 * # Por que esta action existe separada das outras de configuração
 *
 * Ela não ajusta como a clínica trabalha: decide se uma **máquina fala com
 * paciente** em nome dela. Até 12/08/2026 o único jeito de desligar era apagar a
 * credencial da OpenAI — quem quisesse parar a IA por uma tarde teria de
 * reconfigurar a integração inteira para voltar.
 *
 * `clinic.settings` é a permissão, a mesma das demais configurações: quem
 * responde pela clínica decide quem responde por ela.
 */
const setAiEnabledSchema = z.object({ enabled: z.boolean() })

type Input = z.infer<typeof setAiEnabledSchema>

const runSetAiEnabled = createAction<Input, { enabled: boolean }>({
  name: 'clinic.setAiEnabled',
  schema: setAiEnabledSchema,
  roles: rolesWith('clinic.settings'),
  messages: {
    forbidden: settingsMessages.forbidden,
    validation: settingsMessages.invalidFields,
    unavailable: settingsMessages.unavailable,
    unexpected: settingsMessages.unexpected,
  },
  cacheTags: ({ clinicId }) => [cacheTags.clinicSettings(clinicId)],
  // `/whatsapp` é onde o estado aparece; `/configuracoes` acompanha porque a
  // preferência mora lá no banco.
  revalidatePaths: ['/whatsapp', '/configuracoes'],

  handler: async (input, context) => {
    const repository = clinicSettingsRepositoryFor(context.supabase)

    try {
      const enabled = await repository.setAiEnabled(context.clinicId, input.enabled)

      // O valor GRAVADO, não o pedido: a tela precisa dizer o que está valendo.
      return ok({ enabled })
    } catch (cause) {
      return toSettingsFailure('clinic.setAiEnabled', cause)
    }
  },

  /*
   * Ligar e desligar a IA é evento de auditoria de primeira ordem.
   *
   * Se um dia alguém perguntar "quem autorizou a máquina a responder meus
   * pacientes?", é esta linha que responde — com autor, clínica e horário, que
   * `recordAuditEvent` deriva da sessão.
   */
  audit: (output) => ({
    action: output.enabled ? 'clinic.ai_enabled' : 'clinic.ai_disabled',
    entityType: 'clinic',
    entityId: null,
    after: { ai_enabled: output.enabled },
  }),
})

export async function setAiEnabledAction(
  rawInput: unknown,
): Promise<ActionResult<{ enabled: boolean }>> {
  return runSetAiEnabled(rawInput)
}

/**
 * A forma que o painel de `integrations` consome.
 *
 * A regra 4 impede aquele módulo de importar esta action, então a ROTA a liga —
 * e o contrato é o mais simples possível: o estado que ficou valendo, ou a
 * mensagem de erro.
 */
export async function setAiEnabledFromScreen(
  enabled: boolean,
): Promise<{ enabled: boolean } | string> {
  const result = await runSetAiEnabled({ enabled })

  return result.ok ? result.data : result.error.message
}
