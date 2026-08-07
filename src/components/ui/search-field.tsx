'use client'

import { Search, X } from 'lucide-react'
import { useId, type InputHTMLAttributes } from 'react'

import { cn } from '@/lib/utils/cn'

export interface SearchFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> {
  label: string
  hideLabel?: boolean
  /** Quando presente, exibe o botao de limpar. */
  onClear?: () => void
}

/**
 * Campo de busca com destaque visual, conforme PATIENTS_DESIGN.md
 * ("o campo de busca deve ter destaque visual").
 */
export function SearchField({
  label,
  hideLabel = true,
  onClear,
  className,
  value,
  ...inputProps
}: SearchFieldProps) {
  const generatedId = useId()
  const inputId = `search-${generatedId}`
  const hasValue = typeof value === 'string' && value.length > 0

  return (
    <div className="flex w-full flex-col gap-1.5">
      <label
        htmlFor={inputId}
        className={cn(
          'text-label font-semibold text-label',
          hideLabel && 'sr-only',
        )}
      >
        {label}
      </label>

      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted"
        />

        <input
          {...inputProps}
          id={inputId}
          type="search"
          value={value}
          className={cn(
            'h-11 w-full rounded-field border border-border-default bg-surface',
            'pr-10 pl-10 text-aux text-foreground placeholder:text-muted',
            'transition-colors hover:border-border-hover',
            'focus:border-focus focus:shadow-[0_0_0_3px_rgba(60,140,112,0.24)] focus:outline-none',
            '[&::-webkit-search-cancel-button]:hidden',
            className,
          )}
        />

        {hasValue && onClear ? (
          <button
            type="button"
            onClick={onClear}
            aria-label="Limpar busca"
            className="absolute top-1/2 right-2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-[8px] text-muted transition-colors hover:bg-row-hover hover:text-foreground"
          >
            <X aria-hidden className="size-4" />
          </button>
        ) : null}
      </div>
    </div>
  )
}
