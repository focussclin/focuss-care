import type {
  InventoryCountData,
  InventoryItem,
  InventoryItemUpdateData,
  InventoryMovement,
  NewInventoryItemData,
  NewInventoryMovementData,
} from './Inventory'

export interface InventoryRepository {
  listItems(clinicId: string): Promise<InventoryItem[]>
  listRecentMovements(clinicId: string): Promise<InventoryMovement[]>
  createItem(
    clinicId: string,
    createdBy: string,
    data: NewInventoryItemData,
  ): Promise<InventoryItem>
  updateItem(
    clinicId: string,
    itemId: string,
    data: InventoryItemUpdateData,
  ): Promise<InventoryItem>
  setItemActive(
    clinicId: string,
    itemId: string,
    isActive: boolean,
  ): Promise<InventoryItem>
  /**
   * Registra a movimentação. **Quem movimentou sai da sessão, no banco.**
   *
   * O autor era parâmetro (`createdBy`), e o `p_created_by` da RPC ia junto. A
   * aplicação sempre passava `context.userId`, mas a RPC tem `grant execute` a
   * `authenticated`: quem chamasse pelo PostgREST direto escolhia o autor, e
   * uma saída de estoque ficava registrada em nome de outra pessoa.
   *
   * Agora a função resolve com `auth.uid()`, como `create_invitation` já fazia.
   * Não é só mais seguro: passar um autor que o banco ignora seria mentira na
   * assinatura.
   */
  recordMovement(
    clinicId: string,
    data: NewInventoryMovementData,
  ): Promise<InventoryMovement>
  /**
   * Ajusta o saldo para o valor **contado**, e devolve o movimento gerado.
   *
   * A diferença é calculada no banco, sob o mesmo lock que grava — nunca aqui.
   * Fazer `contado - saldo` na aplicação exigiria ler o saldo antes, e duas
   * contagens simultâneas partiriam do mesmo número velho: a última gravaria
   * por cima da primeira e o consumo do intervalo sumiria.
   *
   * Devolve `null` quando a contagem confere com o saldo. É o resultado normal
   * de conferir um item que está certo, não um erro.
   */
  setQuantity(
    clinicId: string,
    data: InventoryCountData,
  ): Promise<InventoryMovement | null>
}
