import 'server-only'

export const INTEGRATION_KEY_VERSION = 1

export class IntegrationVaultError extends Error {
  constructor(readonly reason: 'not-configured' | 'invalid-key' | 'invalid-payload') {
    super('Integration vault is not available')
    this.name = 'IntegrationVaultError'
  }
}

interface EncryptedPayload {
  version: typeof INTEGRATION_KEY_VERSION
  iv: string
  data: string
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer
}

function base64ToBytes(value: string): Uint8Array {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
    const binary = atob(normalized)
    return Uint8Array.from(binary, (character) => character.charCodeAt(0))
  } catch {
    throw new IntegrationVaultError('invalid-key')
  }
}

async function encryptionKey(): Promise<CryptoKey> {
  const configured = process.env.INTEGRATION_ENCRYPTION_KEY?.trim()
  if (!configured) throw new IntegrationVaultError('not-configured')

  const raw = base64ToBytes(configured)
  if (raw.byteLength !== 32) {
    throw new IntegrationVaultError('invalid-key')
  }

  return crypto.subtle.importKey(
    'raw',
    asArrayBuffer(raw),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  )
}

/**
 * Criptografa a carga inteira antes de ela entrar no Supabase.
 * AES-GCM autentica o conteúdo além de mantê-lo ilegível em repouso.
 */
export async function encryptIntegrationCredentials(
  values: Record<string, string>,
): Promise<string> {
  const key = await encryptionKey()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(JSON.stringify(values))
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: asArrayBuffer(iv) },
    key,
    asArrayBuffer(encoded),
  )

  const payload: EncryptedPayload = {
    version: INTEGRATION_KEY_VERSION,
    iv: bytesToBase64(iv),
    data: bytesToBase64(new Uint8Array(encrypted)),
  }

  return JSON.stringify(payload)
}

/**
 * Uso reservado a adapters server-side que realmente precisarem chamar o
 * provedor. O painel nunca chama esta função e nunca recebe o resultado.
 */
export async function decryptIntegrationCredentials(
  serialized: string,
): Promise<Record<string, string>> {
  let payload: EncryptedPayload
  try {
    payload = JSON.parse(serialized) as EncryptedPayload
  } catch {
    throw new IntegrationVaultError('invalid-payload')
  }

  if (
    payload.version !== INTEGRATION_KEY_VERSION ||
    typeof payload.iv !== 'string' ||
    typeof payload.data !== 'string'
  ) {
    throw new IntegrationVaultError('invalid-payload')
  }

  const key = await encryptionKey()
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: asArrayBuffer(base64ToBytes(payload.iv)) },
      key,
      asArrayBuffer(base64ToBytes(payload.data)),
    )
    const parsed: unknown = JSON.parse(new TextDecoder().decode(decrypted))

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new IntegrationVaultError('invalid-payload')
    }

    const values: Record<string, string> = {}
    for (const [name, value] of Object.entries(parsed)) {
      if (typeof value !== 'string') {
        throw new IntegrationVaultError('invalid-payload')
      }
      values[name] = value
    }

    return values
  } catch (cause) {
    if (cause instanceof IntegrationVaultError) throw cause
    throw new IntegrationVaultError('invalid-payload')
  }
}
