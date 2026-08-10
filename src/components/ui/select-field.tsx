'use client'

import { AlertCircle, ChevronDown } from 'lucide-react'
import { forwardRef, useId, type SelectHTMLAttributes } from 'react'

import { cn } from '@/lib/utils/cn'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectFieldProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id' | 'children'> {
  label: string
  options: readonly SelectOption[]
  /** Esconde o rotulo visualmente mantendo-o para leitores de tela. */
  hideLabel?: boolean
  /** Mensagem curta abaixo do campo, no mesmo padrao do TextField. */
  error?: string
  /**
   * Explicacao curta abaixo do campo. Cede lugar ao `error`, como no TextField.
   *
   * `TextField` e `TextareaField` ja tinham; este nao, e a ausencia forcava
   * quem precisava explicar um `<select>` a pendurar um `<p>` solto ao lado —
   * fora do `aria-describedby`, ou seja, invisivel para leitor de tela.
   */
  hint?: string
}

/**
 * Select nativo estilizado.
 * Escolha deliberada em vez de um combobox custom: teclado, leitores de tela e o
 * seletor nativo do mobile funcionam sem reimplementacao, e os handoffs exigem
 * label associado e navegacao completa por teclado.
 */
export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  function SelectField(
    { label, options, hideLabel = false, error, hint, className, ...selectProps },
    ref,
  ) {
    const generatedId = useId()
    const selectId = `select-${generatedId}`
    const errorId = `${selectId}-error`
    const hintId = `${selectId}-hint`
    const hasError = Boolean(error)

    return (
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={selectId}
          className={cn(
            'text-label font-semibold text-label',
            hideLabel && 'sr-only',
          )}
        >
          {label}
        </label>

        <div className="relative">
          <select
            {...selectProps}
            ref={ref}
            id={selectId}
            aria-invalid={hasError || undefined}
            aria-describedby={hasError ? errorId : hint ? hintId : undefined}
            className={cn(
              // 44px: altura minima de controle definida em AGENDA_DESIGN.md
              'h-11 w-full appearance-none rounded-field border bg-surface',
              'pr-10 pl-3.5 text-aux text-foreground',
              'transition-colors',
              'focus:shadow-focus focus:outline-none',
              hasError
                ? 'border-danger focus:border-danger'
                : 'border-border-default hover:border-border-hover focus:border-focus',
              className,
            )}
          >
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <ChevronDown
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted"
          />
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
          // O erro VENCE a dica, como no TextField: dois textos abaixo do
          // mesmo campo competem, e o que importa nesse momento é o erro.
          <p id={hintId} className="text-label text-muted">
            {hint}
          </p>
        ) : null}
      </div>
    )
  },
)
