import { describe, expect, it } from 'vitest'

import {
  normalizeIntegrationCredentialValues,
  saveIntegrationCredentialSchema,
} from './integrationCredential.schema'

describe('integration credential schema', () => {
  it('accepts a complete Evolution API configuration', () => {
    expect(
      saveIntegrationCredentialSchema.safeParse({
        provider: 'evolution',
        values: {
          baseUrl: 'https://whatsapp.example.com',
          apiKey: 'unit-test-token',
          instanceName: 'clinic',
        },
      }).success,
    ).toBe(true)
  })

  it('requires at least one Brevo credential', () => {
    const result = saveIntegrationCredentialSchema.safeParse({
      provider: 'brevo',
      values: { senderEmail: 'sender@example.com' },
    })

    expect(result.success).toBe(false)
  })

  it('rejects unknown fields and malformed URLs', () => {
    const result = saveIntegrationCredentialSchema.safeParse({
      provider: 'deepseek',
      values: {
        apiKey: 'unit-test-token',
        baseUrl: 'not-a-url',
        databasePassword: 'must-not-be-accepted',
      },
    })

    expect(result.success).toBe(false)
  })

  it('normalizes only the fields owned by the provider', () => {
    expect(
      normalizeIntegrationCredentialValues('brevo', {
        apiKey: '  unit-test-token  ',
        smtpKey: '',
        databasePassword: 'should-not-persist',
      }),
    ).toEqual({ apiKey: 'unit-test-token' })
  })
})
