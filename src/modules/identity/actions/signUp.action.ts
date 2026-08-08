'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'

import {
  signUpMessages,
  signUpSchema,
  type SignUpInput,
} from '../schemas/signUp.schema'

export interface SignUpResult {
  ok: boolean
  /** Mensagem pronta para exibicao. Nunca revela se o e-mail ja existe. */
  error?: string
  fieldErrors?: Partial<Record<keyof SignUpInput, string>>
  /**
   * True quando o projeto exige confirmacao por e-mail: a conta existe, mas nao
   * ha sessao ainda, entao nao adianta mandar o usuario para o onboarding.
   */
  requiresEmailConfirmation?: boolean
}

function isAlreadyRegisteredError(error: {
  code?: string
  message?: string
  status?: number
}) {
  const message = (error.message ?? '').toLowerCase()
  return (
    error.code === 'user_already_exists' ||
    (error.status === 422 &&
      (message.includes('already registered') || message.includes('already exists')))
  )
}

/**
 * Cria a conta e, quando o projeto nao exige confirmacao por e-mail, ja abre a
 * sessao. O destino seguinte e o /onboarding: sem clinica, o usuario nao tem o
 * que ver no dashboard.
 *
 * A recuperacao de senha nao e tocada aqui — continua no fluxo proprio.
 */
export async function signUpAction(input: SignUpInput): Promise<SignUpResult> {
  const parsed = signUpSchema.safeParse(input)

  if (!parsed.success) {
    const fieldErrors: SignUpResult['fieldErrors'] = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0]
      if (field === 'fullName' || field === 'email' || field === 'password') {
        fieldErrors[field] ??= issue.message
      }
    }

    return { ok: false, error: signUpMessages.signUpFailed, fieldErrors }
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return { ok: false, error: signUpMessages.unexpected }
  }

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      // O trigger de `profiles` no banco le full_name dos metadados do Auth.
      data: { full_name: parsed.data.fullName },
    },
  })

  if (error) {
    console.error('[signUpAction]', {
      code: error.code ?? 'unknown',
      status: error.status ?? null,
    })
    if (isAlreadyRegisteredError(error)) {
      return { ok: true, requiresEmailConfirmation: true }
    }
    return { ok: false, error: signUpMessages.signUpFailed }
  }

  // Uniformiza o desfecho: com ou sem confirmação de e-mail, o cadastro não
  // revela se o e-mail já existia nem deixa uma sessão parcialmente configurada.
  if (data.session) await supabase.auth.signOut()

  return { ok: true, requiresEmailConfirmation: true }
}
