'use client'

import { AlertCircle } from 'lucide-react'
import { forwardRef, useId, type TextareaHTMLAttributes } from 'react'

import { cn } from '@/lib/utils/cn'

export interface TextareaFieldProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label: string
  error?: string
  hint?: string
}

/** Campo multilinha com o mesmo contrato de acessibilidade do TextField. */
export const TextareaField = forwardRef<HTMLTextAreaElement, TextareaFieldProps>(
  function TextareaField(
    { label, error, hint, className, ...textareaProps },
    ref,
  ) {
    const generatedId = useId()
    const textareaId = `textarea-${generatedId}`
    const errorId = `${textareaId}-error`
    const hintId = `${textareaId}-hint`
    const hasError = Boolean(error)

    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={textareaId} className="text-label font-semibold text-label">
          {label}
        </label>

        <textarea
          {...textareaProps}
          ref={ref}
          id={textareaId}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? errorId : hint ? hintId : undefined}
          className={cn(
            'min-h-[96px] w-full resize-y rounded-field border bg-surface px-4 py-3 text-control text-foreground',
            'placeholder:text-muted transition-[border-color,box-shadow] duration-150',
            'focus:outline-none',
            hasError
              ? 'border-danger focus:border-danger focus:shadow-focus-danger'
              : 'border-border-default hover:border-border-hover focus:border-focus focus:shadow-focus',
            'disabled:cursor-not-allowed disabled:opacity-60',
            className,
          )}
        />

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
