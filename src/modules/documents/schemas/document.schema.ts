import { z } from 'zod'

import { DOCUMENT_KINDS, type DocumentKind } from '../domain/Document'

export const documentMessages = {
  patientRequired: 'Selecione o paciente do documento.',
  kindInvalid: 'Escolha um tipo de documento válido.',
  fileRequired: 'Selecione um arquivo para enviar.',
  fileInvalid: 'O arquivo selecionado é inválido.',
  fileTooLarge: 'O arquivo deve ter no máximo 10 MB.',
  fileTypeInvalid: 'Use PDF, imagem, documento de texto ou planilha.',
  nameInvalid: 'O nome do arquivo é inválido.',
  schemaPending:
    'A central de documentos ainda não está preparada no banco. Aplique a migration indicada e tente novamente.',
  storagePending:
    'O armazenamento privado ainda não está configurado. Aplique a migration de documentos para liberar uploads e downloads.',
  forbidden: 'Você não tem permissão para acessar documentos desta clínica.',
  notFound: 'Este documento não está mais disponível nesta clínica.',
  unavailable: 'Não foi possível acessar o armazenamento agora. Tente novamente.',
  unexpected: 'Não foi possível concluir a operação agora. Tente novamente.',
} as const

export const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024
export const DOCUMENT_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const

const fileSchema = z.custom<File>(
  (value) =>
    typeof File !== 'undefined' &&
    value instanceof File &&
    value.size > 0 &&
    value.size <= DOCUMENT_MAX_BYTES &&
    value.name.trim().length > 0 &&
    DOCUMENT_ALLOWED_MIME_TYPES.includes(
      value.type as (typeof DOCUMENT_ALLOWED_MIME_TYPES)[number],
    ),
  documentMessages.fileInvalid,
)

export const uploadDocumentSchema = z.object({
  patientId: z.uuid(documentMessages.patientRequired),
  kind: z.enum(DOCUMENT_KINDS, documentMessages.kindInvalid),
  file: fileSchema,
})

export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>

export const documentIdSchema = z.object({
  documentId: z.uuid(documentMessages.notFound),
})

export type DocumentIdInput = z.infer<typeof documentIdSchema>

export interface DocumentDto {
  id: string
  patientId: string
  patientName: string
  kind: DocumentKind
  fileName: string
  mimeType: string | null
  sizeBytes: number | null
  createdAt: string
}

export interface DocumentPatientOption {
  id: string
  name: string
}
