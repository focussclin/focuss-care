export default function InventoryLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Carregando estoque">
      <div className="flex flex-col gap-2">
        <div className="h-3 w-20 animate-pulse rounded-full bg-surface-muted" />
        <div className="h-9 w-52 animate-pulse rounded-field bg-surface-muted" />
        <div className="h-4 w-[min(32rem,90%)] animate-pulse rounded-full bg-surface-muted" />
      </div>
      <div className="grid grid-cols-2 gap-4 nav:grid-cols-4">
        {[1, 2, 3, 4].map((item) => <div key={item} className="h-24 animate-pulse rounded-card border border-border-card bg-surface" />)}
      </div>
      <div className="h-[28rem] animate-pulse rounded-card border border-border-card bg-surface" />
    </div>
  )
}
