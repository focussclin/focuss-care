/**
 * As rotas de UM paciente, montadas a partir de um id validado.
 *
 * # Por que isto mora em `lib/`, e não em `modules/patients`
 *
 * Dois módulos precisam invalidar as mesmas telas: `patients`, ao editar o
 * cadastro, e `scheduling`, ao mexer num atendimento que a ficha lista. A regra
 * 4 proíbe um módulo de alcançar o interior do outro — e o lint pegou a
 * tentativa. O que se compartilha aqui não é regra de negócio: é o **formato das
 * URLs do produto**, que pertence à camada de composição.
 *
 * # Por que caminho literal, e não `'/pacientes/[patientId]'`
 *
 * A doc do Next oferece as duas formas, e elas fazem coisas diferentes:
 *
 *  - `revalidatePath('/pacientes/abc-123')` invalida a ficha daquele paciente.
 *  - `revalidatePath('/pacientes/[patientId]', 'page')` invalida **a ficha de
 *    todos os pacientes da instalação**.
 *
 * A segunda é correta e cara — e cara do jeito que ninguém mede: editar o
 * telefone de uma pessoa jogaria fora o cache de ficha de todo mundo, em todas
 * as clínicas. Numa base de mil pacientes, mil revalidações por edição.
 *
 * O `type` fica de fora de propósito: a doc manda omiti-lo em caminho literal e
 * reservá-lo para padrão com segmento dinâmico. Ver
 * node_modules/next/dist/docs/01-app/03-api-reference/04-functions/
 * revalidatePath.md §"Revalidating a specific path".
 *
 * # O id precisa chegar aqui já validado
 *
 * Esta função monta uma URL. Um id vindo cru do formulário produziria um caminho
 * inexistente — e `revalidatePath` aceita qualquer string sem reclamar, então o
 * efeito seria a ficha não atualizar, sem erro em lugar nenhum. Todos os
 * chamadores passam o id que **saiu do repositório**, depois da RLS: a linha que
 * o banco confirmou, não a que o cliente pediu.
 */
/**
 * A listagem de pacientes já filtrada por um termo.
 *
 * # O nome do parâmetro é `q`, e isso não é detalhe
 *
 * `/pacientes` lê `q` — está em `patientListQuerySchema` e em
 * `patientListHref`. Montar `?search=…` produziria uma URL que a rota **ignora
 * em silêncio**: a pessoa pediria "Maria" e receberia a base inteira, sem erro
 * nenhum na tela. É o mesmo formato que a listagem já usa nos próprios links de
 * filtro e paginação, e mantê-los iguais é o que garante que o botão "próxima
 * página" continue funcionando depois de uma busca vinda daqui.
 *
 * # O termo NÃO é higienizado aqui
 *
 * Quem limpa é a rota, com `sanitizePatientSearch` — ela tira curinga de LIKE,
 * gramática do PostgREST e caractere invisível antes de a consulta existir.
 * Repetir a limpeza aqui criaria duas regras para a mesma coisa, e a que
 * envelhecesse primeiro passaria a discordar em silêncio. Este helper só
 * codifica para caber numa URL.
 *
 * # `URLSearchParams`, e não `encodeURIComponent`
 *
 * As duas codificações funcionam, e produzem strings DIFERENTES: espaço vira
 * `+` na primeira e `%20` na segunda. A listagem monta os próprios links de
 * filtro e paginação com `URLSearchParams` (`patientListHref`), então usar a
 * outra aqui faria a mesma busca ter dois endereços. Um teste compara os dois
 * construtores justamente para que continuem idênticos.
 */
export function patientSearchHref(term: string): string {
  const trimmed = term.trim()
  if (trimmed === '') return '/pacientes'

  const params = new URLSearchParams()
  params.set('q', trimmed)

  return `/pacientes?${params.toString()}`
}

export function patientPaths(patientId: string): readonly string[] {
  /*
   * Guarda de sanidade, não validação de entrada.
   *
   * Id vazio viraria `/pacientes/`, que invalida a LISTAGEM em vez da ficha —
   * revalidação no lugar errado é pior que revalidação nenhuma, porque some sem
   * deixar rastro. Id com barra viraria uma rota que não existe.
   */
  const trimmed = patientId.trim()
  if (trimmed === '' || trimmed.includes('/')) return []

  return [
    `/pacientes/${trimmed}`,
    // O histórico é outra página: `/pacientes/<id>` não o alcança, e ele mostra
    // o nome do paciente e os mesmos atendimentos.
    `/pacientes/${trimmed}/historico`,
  ]
}
