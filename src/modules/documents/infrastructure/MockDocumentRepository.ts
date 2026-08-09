import type { DocumentRepository } from '../domain/DocumentRepository'
import type { PatientDocument } from '../domain/Document'
import { DocumentRepositoryError } from '../domain/DocumentRepositoryError'

/** Modo demonstração sem documentos fictícios. Dados pessoais não são mockados. */
export class MockDocumentRepository implements DocumentRepository {
  async list(): Promise<PatientDocument[]> {
    return []
  }

  async findById(): Promise<PatientDocument | null> {
    return null
  }

  async create(): Promise<PatientDocument> {
    throw new DocumentRepositoryError(
      'storage-not-ready',
      'armazenamento não disponível no modo demonstração',
    )
  }
}
