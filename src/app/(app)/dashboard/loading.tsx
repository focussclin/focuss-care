import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { StatCardSkeleton } from '@/components/ui/stat-card'

/**
 * Skeleton do dashboard. Reproduz a mesma grade da tela real para que o layout nao
 * se desloque quando os dados chegam — requisito de DASHBOARD_DESIGN.md.
 */
export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 nav:flex-row nav:items-start nav:justify-between">
        <div>
          <Skeleton className="h-3.5 w-48" />
          <Skeleton className="mt-2.5 h-8 w-64" />
          <Skeleton className="mt-2 h-4 w-56" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="size-11 rounded-field" />
          <Skeleton className="size-10 rounded-full" />
          <Skeleton className="h-11 w-44 rounded-field" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 nav:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <StatCardSkeleton key={index} />
        ))}
      </div>

      <Card className="p-2">
        <div className="grid gap-1 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex items-start gap-3 p-3">
              <Skeleton className="size-9 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="mt-2 h-3 w-40" />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 nav:grid-cols-[3fr_2fr]">
        <Card className="p-5">
          <Skeleton className="h-5 w-40" />
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="mt-5 flex items-center gap-4">
              <Skeleton className="h-4 w-12" />
              <div className="flex-1">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="mt-2 h-3 w-56" />
              </div>
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
          ))}
        </Card>

        <Card className="p-5">
          <Skeleton className="h-5 w-36" />
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="mt-4 flex items-start gap-3">
              <Skeleton className="size-8 rounded-full" />
              <div className="flex-1">
                <Skeleton className="h-4 w-full max-w-[15rem]" />
                <Skeleton className="mt-2 h-3 w-16" />
              </div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}
