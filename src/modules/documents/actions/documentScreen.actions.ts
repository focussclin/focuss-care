'use server'

import { createDocumentDownloadAction } from './createDocumentDownload.action'
import { uploadDocumentAction } from './uploadDocument.action'

export async function uploadDocumentFromScreen(
  formData: FormData,
): Promise<string | null> {
  const result = await uploadDocumentAction(formData)
  return result.ok ? null : result.error.message
}

export async function getDocumentDownloadUrlFromScreen(
  documentId: string,
): Promise<{ url: string | null; error: string | null }> {
  const result = await createDocumentDownloadAction({ documentId })
  return result.ok
    ? { url: result.data, error: null }
    : { url: null, error: result.error.message }
}
