import { Skeleton } from '@/components/ui/skeleton'

export default function CrmLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Carregando CRM">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-[min(100%,38rem)]" />
      </div>
      <Skeleton className="h-44 w-full rounded-card" />
      <Skeleton className="h-[28rem] w-full rounded-card" />
    </div>
  )
}
