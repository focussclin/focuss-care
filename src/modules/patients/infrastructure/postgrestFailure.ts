import 'server-only'

import { PatientRepositoryError } from '../domain/PatientRepositoryError'

/**
 * Recusa do Postgres -> vocabulario do dominio.
 *
 * ## Por que este arquivo existe separado
 *
 * `SupabasePatientRepository` tem, hoje, versoes privadas destas duas funcoes. P-03
 * precisava exatamente da mesma traducao e havia dois caminhos: mexer naquele
 * arquivo para extrair as funcoes, ou escrever a tabela de codigos de novo.
 *
 * Nenhum dos dois e bom, e o escolhido foi um terceiro: as funcoes nascem aqui,
 * publicas e testadas, e o adapter novo as usa. `SupabasePatientRepository`
 * continua intocado nesta fatia — ele e area de outro agente no worktree
 * compartilhado (§6 do roadmap), e unificar as duas copias e uma edicao que nao
 * pertence a P-03. **A duplicacao esta declarada em
 * docs/07-cadastro-de-pacientes.md §9.7 como pendencia**, nao escondida.
 *
 * ## A regra que as duas funcoes impoem
 *
 * A mensagem do Postgres NUNCA sobe para a tela. Em desenvolvimento ela apareceria
 * no boundary de erro, e nome de coluna, nome de policy e SQLSTATE sao mapa da
 * estrutura interna (§4 de docs/06-acoes-e-auditoria.md). O que sobe e vocabulario
 * de dominio; o detalhe fica no log do servidor.
 */

export interface PostgrestLikeError {
  code?: string | null
  message?: string | null
}

/**
 * Falha de ESCRITA.
 *
 * `23505` (unique_violation) esta mapeado mesmo sem indice unico conhecido em
 * `consents`: se alguem criar o indice parcial que impede dois consentimentos
 * vigentes da mesma finalidade — que e a correcao estrutural da corrida descrita
 * em docs/07-cadastro-de-pacientes.md §9.5 — a acao passa a responder 'conflito'
 * sozinha, sem precisar de codigo novo.
 */
export function toPatientWriteError(
  error: PostgrestLikeError,
): PatientRepositoryError {
  const code = error.code ?? undefined
  const message = error.message ?? 'sem mensagem'

  if (code === '23505') {
    return new PatientRepositoryError('conflict', message, code)
  }

  // 42501 = insufficient_privilege (policy recusou); PGRST301 = JWT invalido.
  if (code === '42501' || code === 'PGRST301') {
    return new PatientRepositoryError('forbidden', message, code)
  }

  // O supabase-js embrulha falha de rede em erro sem SQLSTATE. Sem codigo e sem
  // resposta do banco, o que houve foi indisponibilidade, nao recusa.
  if (!code && /fetch|network|timeout|econnre/i.test(message)) {
    return new PatientRepositoryError('unavailable', message)
  }

  return new PatientRepositoryError('unexpected', message, code)
}

/**
 * Falha de LEITURA -> `Error` generico, com a causa so no log do servidor.
 *
 * Leitura nao tem vocabulario de dominio (nao ha "conflito" ao listar), entao sai
 * um `Error` comum que o `error.tsx` da rota traduz para o usuario.
 *
 * Do erro do banco vao para o log apenas `code` e `message`. Nao ha `details` nem
 * `hint` de proposito: em tabelas de paciente, o `details` de uma violacao ecoa o
 * VALOR enviado — e o log e lido por muito mais gente do que a tabela.
 */
export function readFailure(
  context: string,
  error: PostgrestLikeError,
  userMessage: string,
): Error {
  console.error(`[patients] ${context}`, {
    code: error.code ?? null,
    message: error.message ?? null,
  })

  return new Error(userMessage)
}
