export default function CatalogLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Carregando catálogo de serviços">
      <div className="flex flex-col gap-2">
        <div className="h-3 w-20 animate-pulse rounded-full bg-surface-muted" />
        <div className="h-9 w-64 animate-pulse rounded-field bg-surface-muted" />
        <div className="h-4 w-[min(32rem,90%)] animate-pulse rounded-full bg-surface-muted" />
      </div>
      <div className="h-[32rem] animate-pulse rounded-card border border-border-card bg-surface" />
    </div>
  )
}
