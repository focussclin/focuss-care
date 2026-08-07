import type { ReactNode } from 'react'

export interface PageHeaderProps {
  /** Texto pequeno em caixa alta acima do titulo. */
  eyebrow: string
  title: string
  description: string
  /** Acoes a direita (botao primario, notificacoes, avatar). */
  actions?: ReactNode
}

/**
 * Cabecalho compartilhado pelas telas internas. Dashboard, agenda e pacientes usam a
 * mesma estrutura (eyebrow / titulo / texto / acao), entao ela mora em um lugar so.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 nav:flex-row nav:items-start nav:justify-between">
      <div className="min-w-0">
        <p className="text-label font-semibold tracking-[0.08em] text-muted uppercase">
          {eyebrow}
        </p>
        <h1 className="mt-1.5 text-display-sm font-semibold tracking-[-0.01em] text-foreground">
          {title}
        </h1>
        <p className="mt-1 text-aux text-muted">{description}</p>
      </div>

      {actions ? (
        <div className="flex shrink-0 items-center gap-2 max-md:w-full">
          {actions}
        </div>
      ) : null}
    </div>
  )
}
