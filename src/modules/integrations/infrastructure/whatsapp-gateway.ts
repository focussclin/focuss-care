import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/database.types'

import {
  WhatsappGatewayError,
  type WhatsappGateway,
} from '../domain/WhatsappConnection'
import { EvolutionWhatsappGateway } from './EvolutionWhatsappGateway'
import { SupabaseIntegrationCredentialRepository } from './SupabaseIntegrationCredentialRepository'

/**
 * Monta o gateway com a credencial DA CLÍNICA ATIVA.
 *
 * # Por que não há URL de provedor em variável de ambiente
 *
 * Seria mais simples e estaria errado: cada clínica tem a própria instância de
 * WhatsApp, e um endereço global faria todas compartilharem o mesmo canal — o
 * pior vazamento possível num produto multi-inquilino, porque a mensagem de uma
 * clínica sairia com o número de outra.
 *
 * A credencial vem do cofre, por `clinic_id`, cifrada em repouso.
 */
export async function whatsappGatewayFor(
  client: SupabaseClient<Database>,
  clinicId: string,
): Promise<WhatsappGateway> {
  const credentials = await new SupabaseIntegrationCredentialRepository(
    client,
  ).load(clinicId, 'evolution')

  if (!credentials) {
    throw new WhatsappGatewayError(
      'not-configured',
      'nenhuma credencial da Evolution API cadastrada nesta clinica',
    )
  }

  const baseUrl = credentials.baseUrl?.trim()
  const apiKey = credentials.apiKey?.trim()
  const instanceName = credentials.instanceName?.trim()

  /*
   * Credencial pela metade é o mesmo que credencial ausente — e falha aqui, não
   * numa requisição HTTP para `undefined/instance/create` cujo erro não diria
   * nada a quem precisa corrigir o cadastro.
   */
  if (!baseUrl || !apiKey || !instanceName) {
    throw new WhatsappGatewayError(
      'not-configured',
      'credencial da Evolution API incompleta: exige URL, chave e instancia',
    )
  }

  return new EvolutionWhatsappGateway({ baseUrl, apiKey, instanceName })
}

/** O nome da instância também é dado da credencial — a tela nunca o escolhe. */
export async function whatsappInstanceName(
  client: SupabaseClient<Database>,
  clinicId: string,
): Promise<string | null> {
  const credentials = await new SupabaseIntegrationCredentialRepository(
    client,
  ).load(clinicId, 'evolution')

  return credentials?.instanceName?.trim() || null
}
