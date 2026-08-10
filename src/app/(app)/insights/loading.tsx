import { Skeleton } from '@/components/ui/skeleton'

export default function InsightsLoading() {
  return (
    <div className="flex flex-col gap-6" aria-label="Carregando insights">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <Skeleton className="h-16 rounded-card" />
      <div className="grid gap-4 xl:grid-cols-2">
        <Skeleton className="h-56 rounded-card" />
        <Skeleton className="h-56 rounded-card" />
        <Skeleton className="h-56 rounded-card" />
        <Skeleton className="h-56 rounded-card" />
      </div>
    </div>
  )
}
