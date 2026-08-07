'use client'

import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check } from 'lucide-react'
import { useId } from 'react'

import { cn } from '@/lib/utils/cn'

export interface CheckboxProps {
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  name?: string
  disabled?: boolean
  className?: string
}

/**
 * Checkbox com rotulo clicavel. A area total respeita os 44px minimos do handoff
 * atraves do padding vertical do <label>.
 */
export function Checkbox({
  label,
  checked,
  onCheckedChange,
  name,
  disabled,
  className,
}: CheckboxProps) {
  const id = useId()

  return (
    <div className={cn('flex items-center', className)}>
      <CheckboxPrimitive.Root
        id={id}
        name={name}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        disabled={disabled}
        className={cn(
          'peer flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border bg-surface',
          'border-border-default transition-colors',
          'hover:border-border-hover',
          'data-[state=checked]:border-brand data-[state=checked]:bg-brand',
          'disabled:cursor-not-allowed disabled:opacity-60',
        )}
      >
        <CheckboxPrimitive.Indicator className="text-brand-foreground">
          <Check aria-hidden className="size-3" strokeWidth={3} />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>

      <label
        htmlFor={id}
        className="cursor-pointer py-3 pl-2 text-aux text-muted select-none peer-disabled:cursor-not-allowed"
      >
        {label}
      </label>
    </div>
  )
}
