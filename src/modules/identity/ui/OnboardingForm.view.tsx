'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { TextField } from '@/components/ui/text-field'

import { signOutAction } from '../actions/signOut.action'
import {
  createClinicSchema,
  slugifyClinicName,
  type CreateClinicInput,
} from '../schemas/clinic.schema'
import type { OnboardingFormViewProps } from './OnboardingForm.props'

/**
 * Apresentacao do onboarding.
 *
 * Substitui o wizard de 3 passos que vivia em OperationsScreens.tsx: aqueles
 * passos (equipe e "primeiro atendimento") nao gravavam nada. Aqui ha um passo
 * so, e ele persiste — o resto entra quando convites (I-04) existirem.
 *
 * Reusa os componentes do design system; nao introduz token nem medida nova.
 */
export function OnboardingFormView({
  onSubmit,
  isSubmitting,
  formError,
  fieldErrors,
  isSuccess,
  claimsStale,
  greetingName,
}: OnboardingFormViewProps) {
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors },
  } = useForm<CreateClinicInput>({
    resolver: zodResolver(createClinicSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: { tradeName: '', slug: '' },
  })

  // Erro que so o servidor conhece (endereco ja em uso) precisa aparecer no campo,
  // nao apenas no aviso do topo — senao o leitor de tela nunca o associa ao input.
  useEffect(() => {
    if (fieldErrors?.slug) {
      setError('slug', { type: 'server', message: fieldErrors.slug })
    }
    if (fieldErrors?.tradeName) {
      setError('tradeName', { type: 'server', message: fieldErrors.tradeName })
    }
  }, [fieldErrors, setError])

  // Assim que o usuario escreve o endereco, a sugestao automatica para de
  // sobrescrever o que ele digitou.
  const slugEditedByUser = useRef(false)

  /** Sugere o endereco enquanto o usuario nao editar o campo por conta propria. */
  function handleTradeNameChange(value: string) {
    if (slugEditedByUser.current) return
    setValue('slug', slugifyClinicName(value), { shouldValidate: false })
  }

  const tradeNameField = register('tradeName')
  const slugField = register('slug')

  return (
    <div className="w-full">
      <p className="text-label font-semibold tracking-[0.08em] text-muted uppercase">
        Configuração inicial
      </p>
      <h1 className="mt-1.5 text-display-sm font-semibold tracking-[-0.02em] text-foreground">
        {greetingName ? `Vamos preparar seu espaço, ${greetingName}.` : 'Vamos preparar seu espaço.'}
      </h1>
      <p className="mt-2 text-control text-muted">
        Crie a clínica que vai reunir sua agenda, seus pacientes e sua equipe.
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

      {isSuccess ? (
        <div
          role="status"
          className="mt-6 flex items-start gap-2 rounded-field border border-status-positive/25 bg-status-positive-surface px-4 py-3 text-aux text-status-positive"
        >
          <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>Clínica criada. Levando você para o dashboard...</span>
        </div>
      ) : null}

      <form
        noValidate
        onSubmit={handleSubmit(onSubmit)}
        className="mt-7 flex flex-col gap-4"
      >
        <TextField
          label="Nome da clínica"
          autoComplete="organization"
          placeholder="Ex.: Focuss Care Clínica"
          disabled={isSubmitting || isSuccess || claimsStale}
          error={errors.tradeName?.message}
          {...tradeNameField}
          onChange={(event) => {
            void tradeNameField.onChange(event)
            handleTradeNameChange(event.target.value)
          }}
        />

        <TextField
          label="Endereço da clínica"
          autoComplete="off"
          inputMode="url"
          placeholder="ex.: clinica-vida"
          hint="Usado para identificar sua clínica. Letras minúsculas, números e hífen."
          disabled={isSubmitting || isSuccess || claimsStale}
          error={errors.slug?.message}
          {...slugField}
          onChange={(event) => {
            slugEditedByUser.current = true
            void slugField.onChange(event)
          }}
        />

        <Button
          type="submit"
          size="lg"
          fullWidth
          isLoading={isSubmitting}
          disabled={isSuccess || claimsStale}
        >
          {isSubmitting ? 'Criando clínica...' : 'Criar clínica'}
          {isSubmitting ? null : <ArrowRight aria-hidden className="size-4" />}
        </Button>
      </form>

      {claimsStale ? (
        <form action={signOutAction} className="mt-4">
          <Button type="submit" variant="secondary" size="lg" fullWidth>
            Sair e entrar novamente
          </Button>
        </form>
      ) : null}

      <p className="mt-6 text-aux leading-6 text-muted">
        Você será o responsável pela clínica. Convites para a equipe ficam
        disponíveis nas configurações assim que o espaço estiver criado.
      </p>
    </div>
  )
}
