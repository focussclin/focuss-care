import { z } from 'zod'

import type { AuthorizationStatus } from '@/lib/supabase/database.types'

/**
 * Busca de guia na paleta de comandos.
 *
 * Contrato próprio, e não uma cópia do de cobrança: a guia é procurada pelo
 * **número** que a operadora devolveu — o que está no papel em cima do balcão e
 * o que a atendente da operadora dita no telefone. Nome do paciente também
 * encontra, porque nem toda guia tem número: enquanto não é respondida, ela não
 * tem nenhum.
 */

/** Quantas guias a paleta mostra. Igual ao teto de cobranças. */
export const AUTHORIZATION_SEARCH_LIMIT = 8

export const AUTHORIZATION_SEARCH_MIN_LENGTH = 2

export const authorizationSearchMessages = {
  queryTooShort: 'Digite pelo menos dois caracteres para buscar.',
  forbidden: 'Você não tem permissão para consultar convênios.',
  unavailable: 'Não foi possível buscar guias agora.',
} as const

export const searchAuthorizationsSchema = z.object({
  query: z
    .string()
    .trim()
    .min(AUTHORIZATION_SEARCH_MIN_LENGTH, authorizationSearchMessages.queryTooShort)
    .max(80, authorizationSearchMessages.unavailable),
})

export type SearchAuthorizationsInput = z.infer<
  typeof searchAuthorizationsSchema
>

/**
 * O que a paleta recebe de uma guia.
 *
 * **Sem procedimento e sem motivo de negativa.** Os dois são o conteúdo clínico
 * da guia, e o adapter nem os seleciona — ver `AuthorizationSearchHit`. Aqui
 * fica só o necessário para reconhecer a guia certa numa lista de oito.
 */
export interface AuthorizationSearchDto {
  id: string
  patientName: string
  authorizationNumber: string | null
  status: AuthorizationStatus
  providerName: string
  /** ISO 8601 completo, em UTC. A paleta formata no fuso de quem lê. */
  requestedAt: string
}
