import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function PortalPacienteLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <p role="status" className="sr-only">
        Carregando suas consultas
      </p>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-8 w-48" />
      </div>

      {[0, 1].map((index) => (
        <Card key={index} className="p-5">
          <Skeleton className="h-5 w-44" />
          <Skeleton className="mt-4 h-40 w-full" />
        </Card>
      ))}
    </div>
  )
}
