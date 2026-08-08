import type { ButtonHTMLAttributes } from 'react'

import { cn } from '@/lib/utils/cn'

export interface IconButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Obrigatorio: os handoffs exigem nome acessivel em todo icone de acao. */
  label: string
  variant?: 'ghost' | 'outline'
}

export function IconButton({
  label,
  variant = 'ghost',
  className,
  type = 'button',
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        // 44px: area clicavel minima definida nos handoffs
        'inline-flex size-11 items-center justify-center rounded-field text-muted',
        'transition-colors hover:text-foreground',
        variant === 'ghost'
          ? 'hover:bg-row-hover'
          : 'border border-border-default bg-surface hover:border-border-hover',
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent',
        className,
      )}
      {...props}
    />
  )
}
