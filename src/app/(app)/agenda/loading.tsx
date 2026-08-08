import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { GRID_HEIGHT } from '@/modules/scheduling/ui/grid'

/** Skeleton da agenda, preservando a altura da grade para o layout nao saltar. */
export default function AgendaLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 nav:flex-row nav:items-start nav:justify-between">
        <div>
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="mt-2.5 h-8 w-40" />
          <Skeleton className="mt-2 h-4 w-64" />
        </div>
        <Skeleton className="h-11 w-44 rounded-field" />
      </div>

      <Card className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="size-11 rounded-field" />
          <Skeleton className="size-11 rounded-field" />
          <Skeleton className="h-11 w-20 rounded-field" />
          <Skeleton className="h-5 w-48" />
          <Skeleton className="ml-auto h-11 w-56 rounded-field" />
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
          <Skeleton className="h-11 rounded-field" />
          <Skeleton className="h-11 rounded-field" />
        </div>
      </Card>

      <Card className="overflow-hidden p-4">
        <div className="flex gap-2">
          {Array.from({ length: 7 }, (_, index) => (
            <Skeleton key={index} className="h-12 flex-1" />
          ))}
        </div>
        {/* Mesma altura da grade real, para o conteudo nao deslocar ao carregar */}
        <div className="mt-3" style={{ height: GRID_HEIGHT }}>
          <Skeleton className="size-full" />
        </div>
      </Card>
    </div>
  )
}
