import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function PortalConviteLoading() {
  return (
    <Card className="p-6" aria-busy="true">
      <p role="status" className="sr-only">
        Verificando o convite
      </p>
      <Skeleton className="h-6 w-52" />
      <Skeleton className="mt-3 h-4 w-full" />
      <Skeleton className="mt-6 h-11 w-full" />
    </Card>
  )
}
