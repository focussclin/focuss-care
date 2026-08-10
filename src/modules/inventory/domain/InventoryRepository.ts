import type {
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
}
