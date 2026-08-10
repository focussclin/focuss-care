import type { Metadata } from 'next'
import { forbidden } from 'next/navigation'
import { connection } from 'next/server'

import { getActiveClinicRole } from '@/lib/auth/active-clinic'
import { can } from '@/lib/auth/permissions'
import { startOfDay } from '@/lib/utils/date'
import {
  getDocumentDownloadUrlFromScreen,
  uploadDocumentFromScreen,
} from '@/modules/documents/actions/documentScreen.actions'
import { toDocumentDto } from '@/modules/documents/application/toDocumentDto'
import { isDocumentRepositoryError } from '@/modules/documents/domain/DocumentRepositoryError'
import {
  getDocumentRepository,
  isDocumentStorageReady,
} from '@/modules/documents/infrastructure/repository'
import { getPatientRepository } from '@/modules/patients/infrastructure/repository'
import { DocumentsScreen } from '@/modules/documents/ui/DocumentsScreen'

export const metadata: Metadata = {
  title: 'Documentos',
  description: 'Arquivos privados e auditáveis dos pacientes.',
}

export default async function DocumentsPage() {
  await connection()

  const [source, patientSource, role] = await Promise.all([
    getDocumentRepository(),
    getPatientRepository(startOfDay(new Date())),
    getActiveClinicRole(),
  ])

  if (source.isLive && !can(role, 'patient.read')) forbidden()

  let documents = [] as Awaited<ReturnType<typeof source.repository.list>>
  let schemaPending = false

  try {
    documents = await source.repository.list(source.clinicId, {
      kind: null,
      patientId: null,
    })
  } catch (cause) {
    if (isDocumentRepositoryError(cause) && cause.reason === 'schema-not-ready') {
      schemaPending = true
    } else {
      throw cause
    }
  }

  const patientPage = await patientSource.repository.listPage(patientSource.clinicId, {
    search: null,
    status: 'active',
    limit: 100,
    cursor: null,
  })

  const storageReady = schemaPending
    ? false
    : await isDocumentStorageReady(source.client, source.clinicId)

  return (
    <DocumentsScreen
      documents={documents.map(toDocumentDto)}
      patients={patientPage.items.map((patient) => ({ id: patient.id, name: patient.name }))}
      onUpload={uploadDocumentFromScreen}
      onDownload={getDocumentDownloadUrlFromScreen}
      isLive={source.isLive}
      schemaPending={schemaPending}
      storageReady={storageReady}
      referenceDate={new Date().toISOString()}
    />
  )
}
