'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { err, ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { insuranceRepositoryFor } from '../infrastructure/repository'
import {
  AUTHORIZATION_SEARCH_LIMIT,
  authorizationSearchMessages,
  searchAuthorizationsSchema,
  type AuthorizationSearchDto,
  type SearchAuthorizationsInput,
} from '../schemas/authorizationSearch.schema'

type Field = 'query'

/**
 * Busca global de guias — fecha o limite que a paleta declarava.
 *
 * Desde a fatia de busca de cobranças, o estado vazio da paleta dizia, com todas
 * as letras, que "prontuários e guias ainda não são pesquisados pelo nome". A
 * frase existia porque a guia não tinha contrato de consulta próprio — e o
 * contrato dela não é o mesmo das outras buscas.
 *
 * # `insurance.manage`, a mesma porta de `/convenios`
 *
 * Não é permissão nova: é a que a rota já exige, e a que as três actions de guia
 * já pedem. A paleta é atalho para uma tela existente, e atalho que alcança o
 * que a tela recusa é a definição de porta lateral. `receptionist` e
 * `professional` continuam sem convênio, como a matriz de I-05 decidiu.
 *
 * # O termo é do cliente; a clínica, não
 *
 * `clinicId` sai de `current_clinic_id()` e vai no `WHERE` das três consultas do
 * adapter. O que vem do formulário é uma string, e ela é saneada antes de virar
 * `ilike` — curinga de LIKE e gramática do PostgREST saem no adapter.
 */
const runSearchAuthorizations = createAction<
  SearchAuthorizationsInput,
  readonly AuthorizationSearchDto[],
  Field
>({
  name: 'insurance.search',
  schema: searchAuthorizationsSchema,
  roles: rolesWith('insurance.manage'),
  messages: {
    forbidden: authorizationSearchMessages.forbidden,
    validation: authorizationSearchMessages.queryTooShort,
    unavailable: authorizationSearchMessages.unavailable,
    unexpected: authorizationSearchMessages.unavailable,
  },

  handler: async (input, context) => {
    try {
      const hits = await insuranceRepositoryFor(
        context.supabase,
      ).searchAuthorizations(
        context.clinicId,
        input.query,
        AUTHORIZATION_SEARCH_LIMIT,
      )

      return ok<readonly AuthorizationSearchDto[]>(
        hits.map((hit) => ({
          id: hit.id,
          patientName: hit.patientName,
          authorizationNumber: hit.authorizationNumber,
          status: hit.status,
          providerName: hit.providerName,
          requestedAt: hit.requestedAt.toISOString(),
        })),
      )
    } catch (cause) {
      /*
       * Só a classe da falha vai para o log.
       *
       * O erro do Postgres pode ecoar o valor consultado, e o valor consultado é
       * o que a pessoa digitou na paleta — que aqui costuma ser o nome de um
       * paciente.
       */
      console.error('[insurance.search] leitura recusada', {
        kind: cause instanceof Error ? cause.name : typeof cause,
      })

      return err<Field>('unavailable', authorizationSearchMessages.unavailable)
    }
  },
})

export async function searchAuthorizationsAction(
  rawInput: unknown,
): Promise<ActionResult<readonly AuthorizationSearchDto[], Field>> {
  return runSearchAuthorizations(rawInput)
}
