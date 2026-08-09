export default function FormsLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Carregando formulários">
      <div className="flex flex-col gap-2">
        <div className="h-3 w-24 animate-pulse rounded-full bg-surface-muted" />
        <div className="h-9 w-72 animate-pulse rounded-field bg-surface-muted" />
        <div className="h-4 w-[min(32rem,90%)] animate-pulse rounded-full bg-surface-muted" />
      </div>
      <div className="grid gap-4 nav:grid-cols-2 xl:grid-cols-3">
        {[1, 2, 3].map((item) => (
          <div key={item} className="h-60 animate-pulse rounded-card border border-border-card bg-surface" />
        ))}
      </div>
    </div>
  )
}
