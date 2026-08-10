import type { DocumentDto, DocumentPatientOption } from '../schemas/document.schema'

export interface DocumentsScreenProps {
  documents: readonly DocumentDto[]
  patients: readonly DocumentPatientOption[]
  onUpload: (formData: FormData) => Promise<string | null>
  onDownload: (
    documentId: string,
  ) => Promise<{ url: string | null; error: string | null }>
  isLive: boolean
  schemaPending?: boolean
  storageReady?: boolean
  referenceDate: string
}
