'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { err, ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toDocumentFailure } from '../application/documentFailure'
import { documentRepositoryFor } from '../infrastructure/repository'
import { DOCUMENT_BUCKET } from '../infrastructure/documentsDatabase'
import {
  documentIdSchema,
  documentMessages,
  type DocumentIdInput,
} from '../schemas/document.schema'

const runCreateDocumentDownload = createAction<DocumentIdInput, string, 'documentId'>({
  name: 'patient_document.download',
  schema: documentIdSchema,
  roles: rolesWith('patient.read'),
  messages: { unavailable: documentMessages.unavailable },
  handler: async (input, context) => {
    try {
      const document = await documentRepositoryFor(context.supabase).findById(
        context.clinicId,
        input.documentId,
      )
      if (!document) return err('not-found', documentMessages.notFound)

      const { data, error } = await context.supabase.storage
        .from(DOCUMENT_BUCKET)
        .createSignedUrl(document.storagePath, 60)

      if (error || !data?.signedUrl) {
        return err('unavailable', documentMessages.storagePending)
      }

      return ok(data.signedUrl)
    } catch (cause) {
      return toDocumentFailure<'documentId'>('patient_document.download', cause)
    }
  },
  audit: (url, input) => ({
    action: 'patient_document.downloaded',
    entityType: 'patient_document',
    entityId: input.documentId,
    after: { signedUrlIssued: Boolean(url) },
  }),
})

export async function createDocumentDownloadAction(
  rawInput: unknown,
): Promise<ActionResult<string, 'documentId'>> {
  return runCreateDocumentDownload(rawInput)
}
