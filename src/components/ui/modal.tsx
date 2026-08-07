'use client'

import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

import { cn } from '@/lib/utils/cn'

export interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
  /** Rodape com as acoes (Cancelar / confirmar). */
  footer?: ReactNode
  className?: string
}

/**
 * Modal do design system.
 * Os handoffs de agenda e pacientes exigem foco preso, fechar com Escape e devolver
 * o foco ao gatilho — comportamento que o Radix Dialog ja garante, motivo de nao
 * reimplementarmos isso a mao.
 * No mobile vira painel ancorado na base, para nao espremer formularios longos.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: ModalProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* bg-foreground em vez de hex fixo: o overlay acompanha a paleta sozinho. */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/35 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in" />

        <DialogPrimitive.Content
          className={cn(
            'fixed z-50 flex flex-col bg-surface shadow-raised',
            'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-card',
            'sm:inset-auto sm:top-1/2 sm:left-1/2 sm:max-h-[88dvh] sm:w-[min(560px,calc(100vw-2rem))]',
            'sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-card',
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border-card px-5 py-4">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-card-title font-semibold text-foreground">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="mt-0.5 text-label text-muted">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>

            <DialogPrimitive.Close
              aria-label="Fechar"
              className="-mt-1 -mr-1 inline-flex size-9 shrink-0 items-center justify-center rounded-field text-muted transition-colors hover:bg-row-hover hover:text-foreground"
            >
              <X aria-hidden className="size-4" />
            </DialogPrimitive.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>

          {footer ? (
            <div className="flex items-center justify-end gap-3 border-t border-border-card px-5 py-4">
              {footer}
            </div>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
