import { cn } from '@/lib/utils/cn'

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl'

const sizeClasses: Record<AvatarSize, string> = {
  sm: 'size-8 text-label',
  md: 'size-10 text-aux',
  lg: 'size-12 text-control',
  xl: 'size-20 text-[1.75rem]',
}

export interface AvatarProps {
  name: string
  size?: AvatarSize
  tone?: 'brand' | 'light'
  className?: string
}

/**
 * Extrai as iniciais respeitando conectivos ("Ana de Souza" -> "AS").
 * Titulos como "Dra." sao ignorados para nao virarem inicial.
 */
export function getInitials(name: string): string {
  const ignored = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'dr', 'dra'])

  const parts = name
    .trim()
    .split(/\s+/)
    .filter((part) => !ignored.has(part.toLowerCase().replace('.', '')))

  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

export function Avatar({
  name,
  size = 'md',
  tone = 'brand',
  className,
}: AvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        tone === 'brand'
          ? 'bg-brand-subtle text-link'
          : 'bg-white/12 text-white',
        sizeClasses[size],
        className,
      )}
    >
      {getInitials(name)}
    </span>
  )
}
