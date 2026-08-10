'use server'

import { rolesWith } from '@/lib/auth/permissions'
import { createAction } from '@/modules/_shared/application/createAction'
import { err, ok, type ActionResult } from '@/modules/_shared/domain/Result'

import { toDocumentDto } from '../application/toDocumentDto'
import { toDocumentFailure } from '../application/documentFailure'
import { documentRepositoryFor } from '../infrastructure/repository'
import { DOCUMENT_BUCKET } from '../infrastructure/documentsDatabase'
import {
  documentMessages,
  uploadDocumentSchema,
  type DocumentDto,
  type UploadDocumentInput,
} from '../schemas/document.schema'

type UploadFields = 'patientId' | 'kind' | 'file'

const runUploadDocument = createAction<UploadDocumentInput, DocumentDto, UploadFields>({
  name: 'patient_document.upload',
  schema: uploadDocumentSchema,
  roles: rolesWith('patient.write'),
  messages: {
    validation: documentMessages.fileInvalid,
    unavailable: documentMessages.unavailable,
    unexpected: documentMessages.unexpected,
  },
  revalidatePaths: ['/documentos'],
  handler: async (input, context) => {
    const { data: patient, error: patientError } = await context.supabase
      .from('patients')
      .select('id')
      .eq('clinic_id', context.clinicId)
      .eq('id', input.patientId)
      .eq('is_active', true)
      .maybeSingle()

    if (patientError) {
      return err<UploadFields>('unavailable', documentMessages.unavailable)
    }
    if (!patient) return err<UploadFields>('not-found', documentMessages.notFound)

    const safeName = sanitizeFileName(input.file.name)
    const storagePath = `${context.clinicId}/${input.patientId}/${crypto.randomUUID()}-${safeName}`
    const storage = context.supabase.storage.from(DOCUMENT_BUCKET)
    const { error: uploadError } = await storage.upload(storagePath, input.file, {
      contentType: input.file.type || 'application/octet-stream',
      upsert: false,
    })

    if (uploadError) {
      const message = uploadError.message.toLowerCase()
      return err<UploadFields>(
        'unavailable',
        message.includes('bucket') || message.includes('not found')
          ? documentMessages.storagePending
          : documentMessages.unavailable,
      )
    }

    try {
      const document = await documentRepositoryFor(context.supabase).create(
        context.clinicId,
        {
          patientId: input.patientId,
          kind: input.kind,
          storagePath,
          fileName: input.file.name.trim().slice(0, 180),
          mimeType: input.file.type || null,
          sizeBytes: input.file.size,
          uploadedBy: context.userId,
        },
      )

      return ok(toDocumentDto(document))
    } catch (cause) {
      // Nunca deixa um objeto órfão no bucket quando a linha não foi gravada.
      await storage.remove([storagePath]).catch(() => undefined)
      return toDocumentFailure<UploadFields>('patient_document.upload', cause)
    }
  },
  audit: (output) => ({
    action: 'patient_document.uploaded',
    entityType: 'patient_document',
    entityId: output.id,
    after: {
      kind: output.kind,
      mimeType: output.mimeType,
      sizeBytes: output.sizeBytes,
    },
  }),
})

export async function uploadDocumentAction(
  formData: FormData,
): Promise<ActionResult<DocumentDto, UploadFields>> {
  const result = await runUploadDocument({
    patientId: formData.get('patientId'),
    kind: formData.get('kind'),
    file: formData.get('file'),
  })

  return result
}

function sanitizeFileName(fileName: string): string {
  const normalized = fileName
    .normalize('NFKC')
    .replace(/[\\/]/g, '-')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 160)

  return normalized || 'documento'
}
