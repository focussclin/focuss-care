'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/text-field'

import { updatePasswordAction } from '../actions/updatePassword.action'
import {
  newPasswordSchema,
  passwordRecoveryMessages,
  type NewPasswordInput,
} from '../schemas/passwordRecovery.schema'

/**
 * Definição da nova senha — segunda metade de **P-RS**.
 *
 * Só chega aqui quem abriu o link do e-mail: a rota confirma a sessão antes de
 * montar este formulário, e a Server Action confirma **de novo** antes de
 * gravar. A validação daqui é conveniência para quem digita; a que decide roda
 * no servidor (ver `updatePassword.action.ts`).
 *
 * O caminho de saída do sucesso é o login, e não o dashboard: a action encerra
 * a sessão aberta pelo link, porque trocar a senha é o momento em que se assume
 * que a anterior vazou.
 */
export function NewPasswordForm() {
  const router = useRouter()

  const [showPassword, setShowPassword] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  /** O link morreu enquanto a tela estava aberta: some o formulário, fica a saída. */
  const [isSessionExpired, setSessionExpired] = useState(false)
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<NewPasswordInput>({
    resolver: zodResolver(newPasswordSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: { password: '', passwordConfirmation: '' },
  })

  function onSubmit(values: NewPasswordInput) {
    setFormError(null)

    startTransition(async () => {
      try {
        const result = await updatePasswordAction(values)

        if (!result.ok) {
          if (result.sessionExpired) {
            setSessionExpired(true)
            return
          }

          if (result.fieldErrors?.password) {
            setError('password', { message: result.fieldErrors.password })
          }
          if (result.fieldErrors?.passwordConfirmation) {
            setError('passwordConfirmation', {
              message: result.fieldErrors.passwordConfirmation,
            })
          }

          setFormError(
            result.error ?? passwordRecoveryMessages.updateUnavailable,
          )
          return
        }

        // A sessão do link acabou de ser encerrada pela action: `refresh()`
        // antes de navegar para o servidor não servir a casca de quem já entrou.
        router.refresh()
        router.replace('/login?aviso=senha-redefinida')
      } catch {
        setFormError(passwordRecoveryMessages.updateUnavailable)
      }
    })
  }

  if (isSessionExpired) {
    return (
      <div
        role="alert"
        className="mt-7 flex flex-col gap-4 rounded-card border border-attention/30 bg-attention-surface px-4 py-4 text-aux text-foreground"
      >
        <p className="flex items-start gap-2.5">
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{passwordRecoveryMessages.linkInvalid}</span>
        </p>

        <Link
          href="/recuperar-senha"
          className="font-semibold text-link hover:underline"
        >
          Pedir um novo link
        </Link>
      </div>
    )
  }

  return (
    <form
      noValidate
      onSubmit={handleSubmit(onSubmit)}
      className="mt-7 flex flex-col gap-4"
    >
      {formError ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-field border border-danger/30 bg-danger-surface px-4 py-3 text-aux text-danger"
        >
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{formError}</span>
        </p>
      ) : null}

      <TextField
        label="Nova senha"
        type={showPassword ? 'text' : 'password'}
        autoComplete="new-password"
        error={errors.password?.message}
        hint="Pelo menos 8 caracteres, com uma letra e um número."
        disabled={isPending}
        trailing={
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
            className="text-muted transition-colors hover:text-foreground"
          >
            {showPassword ? (
              <EyeOff aria-hidden className="size-4" />
            ) : (
              <Eye aria-hidden className="size-4" />
            )}
          </button>
        }
        {...register('password')}
      />

      <TextField
        label="Repita a nova senha"
        type={showPassword ? 'text' : 'password'}
        autoComplete="new-password"
        error={errors.passwordConfirmation?.message}
        disabled={isPending}
        {...register('passwordConfirmation')}
      />

      <Button
        type="submit"
        size="lg"
        fullWidth
        disabled={isPending}
        aria-label={isPending ? 'Salvando… — salvar nova senha' : 'Salvar nova senha'}
      >
        {isPending ? 'Salvando…' : 'Salvar nova senha'}
      </Button>
    </form>
  )
}
