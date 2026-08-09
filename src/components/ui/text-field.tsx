'use client'

import { AlertCircle } from 'lucide-react'
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react'

import { cn } from '@/lib/utils/cn'

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string
  /** Esconde o rótulo visualmente mantendo-o associado para leitores de tela. */
  hideLabel?: boolean
  /** Mensagem curta abaixo do campo. Presenca dela ja marca o campo como invalido. */
  error?: string
  hint?: string
  /** Slot a direita dentro do campo (ex.: botao de mostrar senha). */
  trailing?: ReactNode
}

/**
 * Campo de texto do design system.
 * Medidas de LOGIN_DESIGN.md: altura 52px, raio 12px, borda 1px, padding lateral 16px.
 * O erro nunca depende so de cor — ha icone e texto, conforme requisito de acessibilidade.
 */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField(
    { label, hideLabel = false, error, hint, trailing, className, ...inputProps },
    ref,
  ) {
    const generatedId = useId()
    const inputId = `field-${generatedId}`
    const errorId = `${inputId}-error`
    const hintId = `${inputId}-hint`
    const hasError = Boolean(error)

    return (
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={inputId}
          className={cn('text-label font-semibold text-label', hideLabel && 'sr-only')}
        >
          {label}
        </label>

        <div className="relative">
          <input
            {...inputProps}
            ref={ref}
            id={inputId}
            aria-invalid={hasError || undefined}
            aria-describedby={
              hasError ? errorId : hint ? hintId : undefined
            }
            className={cn(
              'h-[52px] w-full rounded-field border bg-surface px-4 text-control text-foreground',
              'placeholder:text-muted',
              'transition-[border-color,box-shadow] duration-150',
              'focus:outline-none',
              hasError
                ? 'border-danger focus:border-danger focus:shadow-focus-danger'
                : 'border-border-default hover:border-border-hover focus:border-focus focus:shadow-focus',
              trailing && 'pr-12',
              className,
            )}
          />
          {trailing ? (
            <div className="absolute inset-y-0 right-2 flex items-center">
              {trailing}
            </div>
          ) : null}
        </div>

        {hasError ? (
          <p
            id={errorId}
            role="alert"
            className="flex items-center gap-1.5 text-label text-danger"
          >
            <AlertCircle aria-hidden className="size-3.5 shrink-0" />
            {error}
          </p>
        ) : hint ? (
          <p id={hintId} className="text-label text-muted">
            {hint}
          </p>
        ) : null}
      </div>
    )
  },
)
