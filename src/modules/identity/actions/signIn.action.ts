'use server'

import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabase/server'

import {
  loginMessages,
  loginSchema,
  type LoginInput,
} from '../schemas/login.schema'

export interface SignInResult {
  ok: boolean
  /** Mensagem pronta para exibicao. Nunca revela se o e-mail existe. */
  error?: string
}

export async function signInAction(input: LoginInput): Promise<SignInResult> {
  const parsed = loginSchema.safeParse(input)

  if (!parsed.success) {
    return { ok: false, error: loginMessages.invalidCredentials }
  }

  const supabase = await createSupabaseServerClient()
  if (!supabase) {
    return { ok: false, error: loginMessages.unexpected }
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) return { ok: false, error: loginMessages.invalidCredentials }

  redirect('/dashboard')
}
