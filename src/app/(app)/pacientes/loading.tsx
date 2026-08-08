import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { StatCardSkeleton } from '@/components/ui/stat-card'

/** Skeleton da busca, dos cards e das linhas, sem mudar o layout. */
export default function PacientesLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 nav:flex-row nav:items-start nav:justify-between">
        <div>
          <Skeleton className="h-3.5 w-36" />
          <Skeleton className="mt-2.5 h-8 w-48" />
          <Skeleton className="mt-2 h-4 w-72" />
        </div>
        <Skeleton className="h-11 w-40 rounded-field" />
      </div>

      <div className="grid grid-cols-2 gap-4 nav:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <StatCardSkeleton key={index} />
        ))}
      </div>

      <Card className="flex flex-col gap-4 p-4">
        <Skeleton className="h-11 w-full rounded-field" />
        <div className="hidden gap-3 md:grid md:max-w-lg md:grid-cols-2">
          <Skeleton className="h-11 rounded-field" />
          <Skeleton className="h-11 rounded-field" />
        </div>
      </Card>

      <Card className="overflow-hidden">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="flex min-h-[72px] items-center gap-3 border-b border-border-card px-5 py-4 last:border-b-0"
          >
            <Skeleton className="size-10 rounded-full" />
            <div className="flex-1">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-2 h-3 w-52" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        ))}
      </Card>
    </div>
  )
}
