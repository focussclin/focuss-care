import { describe, expect, it } from 'vitest'

import { normalizePatientAdminNote } from './patientAdminNotes'

describe('normalizePatientAdminNote', () => {
  it('remove espacos laterais sem alterar o texto administrativo', () => {
    expect(normalizePatientAdminNote('  prefere contato por WhatsApp  ')).toBe(
      'prefere contato por WhatsApp',
    )
  })

  it('trata null, undefined e texto vazio como ausencia de observacao', () => {
    expect(normalizePatientAdminNote(null)).toBeNull()
    expect(normalizePatientAdminNote(undefined)).toBeNull()
    expect(normalizePatientAdminNote('   ')).toBeNull()
  })
})
