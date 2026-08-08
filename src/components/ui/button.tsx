import { Slot } from '@radix-ui/react-slot'
import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

import { cn } from '@/lib/utils/cn'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
type ButtonSize = 'md' | 'lg'

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-brand text-brand-foreground hover:bg-brand-hover disabled:hover:bg-brand',
  secondary:
    'bg-surface text-foreground border border-border-default hover:border-border-hover hover:bg-row-hover disabled:hover:border-border-default disabled:hover:bg-surface',
  ghost: 'bg-transparent text-link hover:bg-brand-subtle',
  danger:
    'bg-danger text-white hover:brightness-95 disabled:hover:brightness-100',
}

const sizeClasses: Record<ButtonSize, string> = {
  /* 44px — area clicavel minima exigida nos handoffs */
  md: 'h-11 px-4 text-aux',
  /* 52px — altura do botao primario definida em LOGIN_DESIGN.md */
  lg: 'h-[52px] px-5 text-control',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Mantem a largura e bloqueia novo envio, conforme handoff. */
  isLoading?: boolean
  fullWidth?: boolean
  /** Renderiza no elemento filho (util para <Link> com aparencia de botao). */
  asChild?: boolean
  children?: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  isLoading = false,
  fullWidth = false,
  asChild = false,
  className,
  disabled,
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : 'button'

  return (
    <Component
      type={asChild ? undefined : type}
      disabled={asChild ? undefined : disabled || isLoading}
      aria-busy={isLoading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-field font-semibold whitespace-nowrap',
        'transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-60',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        className,
      )}
      {...props}
    >
      {isLoading ? (
        <>
          <Loader2 aria-hidden className="size-4 animate-spin" />
          <span>{children}</span>
        </>
      ) : (
        children
      )}
    </Component>
  )
}
