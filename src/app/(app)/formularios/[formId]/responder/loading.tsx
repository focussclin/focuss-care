export default function FormResponseLoading() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6" aria-busy="true" aria-label="Carregando formulário">
      <div className="h-10 w-52 animate-pulse rounded-field bg-surface-muted" />
      <div className="flex flex-col gap-2">
        <div className="h-3 w-28 animate-pulse rounded-full bg-surface-muted" />
        <div className="h-9 w-80 animate-pulse rounded-field bg-surface-muted" />
        <div className="h-4 w-[min(34rem,90%)] animate-pulse rounded-full bg-surface-muted" />
      </div>
      <div className="h-24 animate-pulse rounded-card border border-border-card bg-surface" />
      <div className="h-[28rem] animate-pulse rounded-card border border-border-card bg-surface" />
    </div>
  )
}
