'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/text-field'

import { signUpSchema, type SignUpInput } from '../schemas/signUp.schema'
import type { SignUpFormViewProps } from './SignUpForm.props'

/**
 * Apresentacao do cadastro. Reusa os mesmos componentes e medidas do login —
 * as duas telas dividem a mesma casca em (auth)/layout.tsx.
 */
export function SignUpFormView({
  onSubmit,
  isSubmitting,
  formError,
  fieldErrors,
  confirmationMessage,
  isSuccess,
  signInHref,
}: SignUpFormViewProps) {
  const [showPassword, setShowPassword] = useState(false)

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: { fullName: '', email: '', password: '' },
  })

  useEffect(() => {
    if (!fieldErrors) return
    for (const field of ['fullName', 'email', 'password'] as const) {
      const message = fieldErrors[field]
      if (message) setError(field, { type: 'server', message })
    }
  }, [fieldErrors, setError])

  const isLocked = isSubmitting || isSuccess || Boolean(confirmationMessage)

  return (
    <div className="flex w-full flex-col">
      <h1 className="text-display-sm font-semibold tracking-[-0.01em] text-foreground md:text-display">
        Criar conta
      </h1>
      <p className="mt-2 text-control text-muted">
        Comece a organizar a rotina da sua clínica em poucos minutos.
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

      {confirmationMessage ? (
        <div
          role="status"
          className="mt-6 flex items-start gap-2 rounded-field border border-status-positive/25 bg-status-positive-surface px-4 py-3 text-aux text-status-positive"
        >
          <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{confirmationMessage}</span>
        </div>
      ) : null}

      {isSuccess && !confirmationMessage ? (
        <div
          role="status"
          className="mt-6 flex items-start gap-2 rounded-field border border-status-positive/25 bg-status-positive-surface px-4 py-3 text-aux text-status-positive"
        >
          <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>Conta criada. Vamos configurar sua clínica...</span>
        </div>
      ) : null}

      <form
        noValidate
        onSubmit={handleSubmit(onSubmit)}
        className="mt-7 flex flex-col gap-4"
      >
        <TextField
          label="Nome completo"
          autoComplete="name"
          placeholder="Como podemos te chamar?"
          disabled={isLocked}
          error={errors.fullName?.message}
          {...register('fullName')}
        />

        <TextField
          label="E-mail"
          type="email"
          autoComplete="email"
          placeholder="voce@clinica.com.br"
          disabled={isLocked}
          error={errors.email?.message}
          {...register('email')}
        />

        <TextField
          label="Senha"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          placeholder="Crie uma senha"
          hint="Mínimo de 8 caracteres, com letras e números."
          disabled={isLocked}
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

        <Button
          type="submit"
          size="lg"
          fullWidth
          isLoading={isSubmitting}
          disabled={isLocked && !isSubmitting}
        >
          {isSubmitting ? 'Criando conta...' : 'Criar conta'}
        </Button>
      </form>

      <p className="mt-8 text-center text-aux text-muted">
        Já tem uma conta?{' '}
        <Link href={signInHref} className="font-semibold text-link hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  )
}
