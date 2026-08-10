export type DocumentRepositoryErrorReason =
  | 'schema-not-ready'
  | 'storage-not-ready'
  | 'forbidden'
  | 'not-found'
  | 'unavailable'
  | 'unexpected'

export class DocumentRepositoryError extends Error {
  constructor(
    public readonly reason: DocumentRepositoryErrorReason,
    message: string,
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'DocumentRepositoryError'
  }
}

export function isDocumentRepositoryError(
  cause: unknown,
): cause is DocumentRepositoryError {
  return cause instanceof DocumentRepositoryError
}
