import { createHmac, timingSafeEqual } from 'node:crypto'
import { cookies } from 'next/headers'

const ADMIN_SESSION_COOKIE = 'focuss-care-admin-session'
const DEFAULT_SESSION_SECONDS = 8 * 60 * 60
const REMEMBERED_SESSION_SECONDS = 30 * 24 * 60 * 60

export type AdminSession = {
  email: string
  expiresAt: number
}

function configuredEmail() {
  return process.env.FOCUSS_ADMIN_EMAIL?.trim().toLowerCase() ?? ''
}

function sessionSecret() {
  return process.env.FOCUSS_ADMIN_SESSION_SECRET ?? ''
}

function sign(payload: string) {
  return createHmac('sha256', sessionSecret()).update(payload).digest('hex')
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)

  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  )
}

export function createAdminSessionToken(email: string, maxAge: number) {
  if (!configuredEmail() || !sessionSecret()) return null

  const expiresAt = Date.now() + maxAge * 1000
  const payload = `${email.toLowerCase()}|${expiresAt}`
  const encodedPayload = Buffer.from(payload).toString('base64url')

  return `${encodedPayload}.${sign(payload)}`
}

export function verifyAdminSessionToken(token: string): AdminSession | null {
  if (!configuredEmail() || !sessionSecret()) return null

  const separator = token.lastIndexOf('.')
  if (separator < 1) return null

  const encodedPayload = token.slice(0, separator)
  const providedSignature = token.slice(separator + 1)

  let payload: string
  try {
    payload = Buffer.from(encodedPayload, 'base64url').toString('utf8')
  } catch {
    return null
  }

  const [email, expiresAtValue] = payload.split('|')
  const expiresAt = Number(expiresAtValue)
  if (!email || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return null
  }

  if (email !== configuredEmail() || !safeEqual(sign(payload), providedSignature)) {
    return null
  }

  return { email, expiresAt }
}

export async function getAdminSession() {
  const cookieStore = await cookies()
  const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value
  return token ? verifyAdminSessionToken(token) : null
}

export async function hasAdminSession() {
  return Boolean(await getAdminSession())
}

export async function setAdminSession(email: string, rememberMe: boolean) {
  const maxAge = rememberMe
    ? REMEMBERED_SESSION_SECONDS
    : DEFAULT_SESSION_SECONDS
  const token = createAdminSessionToken(email, maxAge)

  if (!token) return false

  const cookieStore = await cookies()
  cookieStore.set({
    name: ADMIN_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    maxAge,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  })

  return true
}

export async function clearAdminSession() {
  const cookieStore = await cookies()
  cookieStore.delete(ADMIN_SESSION_COOKIE)
}

export function adminCredentialsMatch(email: string, password: string) {
  const configuredPassword = process.env.FOCUSS_ADMIN_PASSWORD
  if (!configuredEmail() || !configuredPassword) return false

  return (
    email.trim().toLowerCase() === configuredEmail() &&
    password === configuredPassword
  )
}
