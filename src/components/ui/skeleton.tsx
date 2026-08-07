import { cn } from '@/lib/utils/cn'

/**
 * Placeholder de carregamento. Os handoffs exigem que o skeleton preserve o layout,
 * entao quem usa deve reproduzir as mesmas dimensoes do conteudo real.
 * A animacao respeita prefers-reduced-motion via regra global em globals.css.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        'animate-pulse rounded-[8px] bg-status-neutral-surface',
        className,
      )}
    />
  )
}
