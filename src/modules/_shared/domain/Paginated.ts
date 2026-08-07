/**
 * Pagina de resultados por CURSOR — divida D12 do roadmap.
 *
 * Por que cursor, e nao `page`/`totalPages`:
 *
 *  - **Offset e instavel sob escrita concorrente.** Cadastrar um paciente
 *    enquanto alguem navega faz uma linha repetir ou sumir entre paginas.
 *  - **`totalPages` exige `count` exato por pagina**, que e um segundo scan da
 *    fatia do tenant a cada navegacao — caro e sem uso real numa listagem
 *    alfabetica onde ninguem salta para "a pagina 37".
 *
 * A consequencia e deliberada: **nao existe total aqui.** Uma tela que precise
 * de total pede uma contagem propria (`head: true`), e assume o custo dela.
 * Inventar `totalPages` a partir do tamanho da pagina e o defeito que este tipo
 * existe para impedir.
 */
export interface Paginated<T> {
  /** Itens desta pagina, no maximo `limit` — nunca a colecao inteira. */
  items: T[]
  /**
   * Ponteiro OPACO para a proxima pagina, ou null quando nao ha mais.
   *
   * Quem consome nao interpreta o conteudo: o formato pertence ao adapter que o
   * emitiu, e mudar esse formato nao pode quebrar a tela.
   */
  nextCursor: string | null
  /** `true` quando existe pelo menos mais uma linha depois desta pagina. */
  hasMore: boolean
}
