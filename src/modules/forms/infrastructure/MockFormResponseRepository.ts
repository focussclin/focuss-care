import type { FormResponseRepository } from '../domain/FormResponseRepository'
import type { FormResponse } from '../domain/FormResponse'

export class MockFormResponseRepository implements FormResponseRepository {
  async create(): Promise<FormResponse> {
    throw new Error('demo repository is read-only')
  }

  async update(): Promise<FormResponse> {
    throw new Error('demo repository is read-only')
  }
}
