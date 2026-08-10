import { Skeleton } from '@/components/ui/skeleton'

export default function InboxLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Carregando inbox">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-4 w-[min(100%,38rem)]" />
      </div>
      <Skeleton className="h-20 w-full rounded-card" />
      <Skeleton className="h-[36rem] w-full rounded-card" />
    </div>
  )
}
