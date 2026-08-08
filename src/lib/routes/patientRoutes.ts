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
