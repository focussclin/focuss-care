import type { FormRepository } from '../domain/FormRepository'
import type { Form } from '../domain/Form'

/** O fallback demonstração é vazio de propósito: não fabrica formulários. */
export class MockFormRepository implements FormRepository {
  async list(): Promise<Form[]> {
    return []
  }

  async create(): Promise<Form> {
    throw new Error('demo repository is read-only')
  }

  async update(): Promise<Form> {
    throw new Error('demo repository is read-only')
  }

  async setStatus(): Promise<Form> {
    throw new Error('demo repository is read-only')
  }
}
