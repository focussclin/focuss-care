import { afterEach, describe, expect, it } from 'vitest'

import {
  decryptIntegrationCredentials,
  encryptIntegrationCredentials,
} from './integration-vault'

function base64For(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

afterEach(() => {
  delete process.env.INTEGRATION_ENCRYPTION_KEY
})

describe('integration vault', () => {
  it('encrypts and decrypts credentials without returning plaintext', async () => {
    process.env.INTEGRATION_ENCRYPTION_KEY = base64For(
      new Uint8Array(32).fill(7),
    )

    const encrypted = await encryptIntegrationCredentials({
      apiKey: 'unit-test-token',
      senderEmail: 'sender@example.com',
    })

    expect(encrypted).not.toContain('unit-test-token')
    expect(encrypted).not.toContain('sender@example.com')
    await expect(decryptIntegrationCredentials(encrypted)).resolves.toEqual({
      apiKey: 'unit-test-token',
      senderEmail: 'sender@example.com',
    })
  })

  it('uses a new authenticated payload for every save', async () => {
    process.env.INTEGRATION_ENCRYPTION_KEY = base64For(
      new Uint8Array(32).fill(3),
    )

    const first = await encryptIntegrationCredentials({ apiKey: 'same-value' })
    const second = await encryptIntegrationCredentials({ apiKey: 'same-value' })

    expect(second).not.toBe(first)
  })

  it('rejects a missing or malformed encryption key', async () => {
    await expect(
      encryptIntegrationCredentials({ apiKey: 'unit-test-token' }),
    ).rejects.toMatchObject({
      reason: 'not-configured',
    })

    process.env.INTEGRATION_ENCRYPTION_KEY = base64For(new Uint8Array(16))
    await expect(
      encryptIntegrationCredentials({ apiKey: 'unit-test-token' }),
    ).rejects.toMatchObject({
      reason: 'invalid-key',
    })
  })

  it('rejects a tampered payload', async () => {
    process.env.INTEGRATION_ENCRYPTION_KEY = base64For(
      new Uint8Array(32).fill(9),
    )
    const encrypted = await encryptIntegrationCredentials({ apiKey: 'value' })
    const payload = JSON.parse(encrypted) as { data: string }
    payload.data = `${payload.data.slice(0, -2)}aa`

    await expect(
      decryptIntegrationCredentials(JSON.stringify(payload)),
    ).rejects.toMatchObject({ reason: 'invalid-payload' })
  })
})
