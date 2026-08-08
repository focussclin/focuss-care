'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { TextField } from '@/components/ui/text-field'

import { loginSchema, type LoginInput } from '../schemas/login.schema'
import type { LoginFormViewProps } from './LoginForm.props'

/**
 * Apresentacao do formulario de login — dono: Codex (design).
 * Nao importa Supabase, Server Actions nem casos de uso: recebe tudo por props.
 * Implementa LOGIN_DESIGN.md secoes "Formulario", "Componentes e estados",
 * "Acessibilidade" e "Copy e comportamento".
 */
export function LoginFormView({
  onSubmit,
  isSubmitting,
  formError,
  socialAuthEnabled,
  onGoogleSignIn,
  isGoogleSubmitting = false,
  buildForgotPasswordHref,
  signUpHref,
}: LoginFormViewProps) {
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    // Handoff: "Nao mostrar erro antes da primeira tentativa de envio."
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: { email: '', password: '', rememberMe: false },
  })

  /*
   * useWatch em vez de watch(): watch() devolve uma funcao nova a cada render, que
   * o React Compiler nao consegue memoizar sem risco de UI defasada.
   */
  const emailValue = useWatch({ control, name: 'email' })

  return (
    <form
      noValidate
      onSubmit={handleSubmit(onSubmit)}
      className="flex w-full flex-col"
    >
      <h1 className="text-display-sm font-semibold tracking-[-0.01em] text-foreground md:text-display">
        Bem-vindo de volta
      </h1>
      <p className="mt-2 text-control text-muted">
        Entre na sua conta para continuar de onde parou.
      </p>

      {formError ? (
        <div
          role="alert"
          className="mt-6 flex items-start gap-2 rounded-field border border-danger/30 bg-danger-surface px-4 py-3 text-aux text-danger"
        >
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{formError}</span>
        </div>
      ) : null}

      <div className="mt-7 flex flex-col gap-4">
        <TextField
          label="E-mail"
          type="email"
          autoComplete="email"
          placeholder="voce@clinica.com.br"
          error={errors.email?.message}
          {...register('email')}
        />

        <TextField
          label="Senha"
          type={showPassword ? 'text' : 'password'}
          autoComplete="current-password"
          placeholder="Sua senha"
          error={errors.password?.message}
          trailing={
            <button
              type="button"
              onClick={() => setShowPassword((visible) => !visible)}
              aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              className="flex size-11 items-center justify-center rounded-[10px] text-muted transition-colors hover:text-foreground"
            >
              {showPassword ? (
                <EyeOff aria-hidden className="size-[18px]" />
              ) : (
                <Eye aria-hidden className="size-[18px]" />
              )}
            </button>
          }
          {...register('password')}
        />
      </div>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-x-4">
        <Controller
          control={control}
          name="rememberMe"
          render={({ field }) => (
            <Checkbox
              label="Lembrar de mim"
              checked={field.value}
              onCheckedChange={field.onChange}
            />
          )}
        />

        <Link
          href={buildForgotPasswordHref(emailValue)}
          className="flex min-h-11 items-center text-aux text-link hover:underline"
        >
          Esqueci minha senha
        </Link>
      </div>

      <Button
        type="submit"
        size="lg"
        fullWidth
        isLoading={isSubmitting}
        className="mt-4"
      >
        {isSubmitting ? 'Entrando...' : 'Entrar'}
      </Button>

      {socialAuthEnabled ? (
        <>
          <div className="my-6 flex items-center gap-4">
            <span className="h-px flex-1 bg-border-default" />
            <span className="text-label text-muted">ou</span>
            <span className="h-px flex-1 bg-border-default" />
          </div>

          <Button
            variant="secondary"
            size="lg"
            fullWidth
            onClick={onGoogleSignIn}
            isLoading={isGoogleSubmitting}
            disabled={isSubmitting || isGoogleSubmitting}
          >
            <GoogleMark />
            {isGoogleSubmitting ? 'Conectando...' : 'Continuar com Google'}
          </Button>
        </>
      ) : null}

      <p className="mt-8 text-center text-aux text-muted">
        Ainda não tem uma conta?{' '}
        <Link
          href={signUpHref}
          className="font-semibold text-link hover:underline"
        >
          Criar conta
        </Link>
      </p>
    </form>
  )
}

function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 18 18" className="size-[18px]">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  )
}
