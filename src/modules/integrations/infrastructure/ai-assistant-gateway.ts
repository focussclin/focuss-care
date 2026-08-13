import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import { AiGatewayError, type AiAssistantGateway } from '../domain/AiAssistant'
import { OpenAiAssistantGateway } from './OpenAiAssistantGateway'
import { SupabaseIntegrationCredentialRepository } from './SupabaseIntegrationCredentialRepository'

/**
 * Monta o assistente com a credencial DA CLÍNICA.
 *
 * Mesmo desenho do gateway de WhatsApp, e pelo mesmo motivo: a chave é de quem
 * paga a conta. Uma chave global no ambiente faria uma clínica gastar o crédito
 * da outra — e, pior, misturaria as conversas na mesma organização da OpenAI.
 */
export async function aiAssistantGatewayFor(
  client: SupabaseClient<Database>,
  clinicId: string,
): Promise<AiAssistantGateway> {
  const credentials = await new SupabaseIntegrationCredentialRepository(client).load(
    clinicId,
    'openai',
  )

  const apiKey = credentials?.apiKey?.trim()

  if (!apiKey) {
    throw new AiGatewayError(
      'not-configured',
      'nenhuma credencial da OpenAI cadastrada nesta clinica',
    )
  }

  return new OpenAiAssistantGateway({ apiKey, model: credentials?.model })
}
