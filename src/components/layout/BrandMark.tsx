import { cn } from '@/lib/utils/cn'

export interface BrandMarkProps {
  /** 'light' para fundos escuros (painel de marca, sidebar). */
  tone?: 'dark' | 'light'
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Marca tipografica do Focuss Care.
 * LOGIN_DESIGN.md: "usar o nome em semibold e um pequeno ponto circular como detalhe".
 */
export function BrandMark({
  tone = 'dark',
  size = 'md',
  className,
}: BrandMarkProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 font-semibold tracking-[-0.01em]',
        size === 'sm' ? 'text-aux' : 'text-card-title',
        tone === 'light' ? 'text-white' : 'text-foreground',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'block size-2 rounded-full',
          tone === 'light' ? 'bg-brand-accent' : 'bg-brand',
        )}
      />
      Focuss Care
    </span>
  )
}
