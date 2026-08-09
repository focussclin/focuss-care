import { Skeleton } from '@/components/ui/skeleton'

export default function SalasERecursosLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Carregando salas e recursos">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <Skeleton className="h-40 w-full rounded-card" />
      <Skeleton className="h-64 w-full rounded-card" />
    </div>
  )
}
