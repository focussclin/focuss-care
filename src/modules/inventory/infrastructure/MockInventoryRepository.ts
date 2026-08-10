import type { InventoryRepository } from '../domain/InventoryRepository'
import type { InventoryItem, InventoryMovement } from '../domain/Inventory'

/** O fallback demo é vazio e read-only para não inventar estoque. */
export class MockInventoryRepository implements InventoryRepository {
  async listItems(): Promise<InventoryItem[]> {
    return []
  }

  async listRecentMovements(): Promise<InventoryMovement[]> {
    return []
  }

  async createItem(): Promise<InventoryItem> {
    throw new Error('demo repository is read-only')
  }

  async updateItem(): Promise<InventoryItem> {
    throw new Error('demo repository is read-only')
  }

  async setItemActive(): Promise<InventoryItem> {
    throw new Error('demo repository is read-only')
  }

  async recordMovement(): Promise<InventoryMovement> {
    throw new Error('demo repository is read-only')
  }

  async setQuantity(): Promise<InventoryMovement | null> {
    throw new Error('demo repository is read-only')
  }
}
