import { describe, expect, it } from 'vitest'

import { documentMessages, uploadDocumentSchema } from './document.schema'

describe('document.schema', () => {
  it('aceita um arquivo permitido dentro do limite', () => {
    const file = new File(['conteúdo'], 'termo.pdf', { type: 'application/pdf' })
    const result = uploadDocumentSchema.safeParse({
      patientId: '00000000-0000-4000-8000-000000000001',
      kind: 'consent_form',
      file,
    })

    expect(result.success).toBe(true)
  })

  it('recusa arquivo vazio ou com tipo não permitido', () => {
    const file = new File([], 'script.exe', { type: 'application/x-msdownload' })
    const result = uploadDocumentSchema.safeParse({
      patientId: '00000000-0000-4000-8000-000000000001',
      kind: 'other',
      file,
    })

    expect(result.success).toBe(false)
    expect(result.success ? '' : result.error.issues[0]?.message).toBe(documentMessages.fileInvalid)
  })
})
