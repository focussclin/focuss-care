import { Skeleton } from '@/components/ui/skeleton'

export default function DocumentsLoading() {
  return (
    <div className="flex flex-col gap-6" aria-label="Carregando documentos">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-10 w-52" />
        <Skeleton className="h-4 w-full max-w-xl" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Skeleton className="h-20 rounded-card" />
        <Skeleton className="h-20 rounded-card" />
        <Skeleton className="h-20 rounded-card" />
      </div>
      <Skeleton className="h-[420px] rounded-card" />
    </div>
  )
}
