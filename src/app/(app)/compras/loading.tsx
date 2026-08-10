import { Card } from '@/components/ui/card'

export default function PurchasesLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Carregando compras">
      <div className="h-20 w-full animate-pulse rounded-card bg-row-hover" />
      <div className="grid grid-cols-2 gap-4 nav:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => <Card key={index} className="h-24 animate-pulse bg-row-hover" />)}
      </div>
      <Card className="h-48 animate-pulse bg-row-hover" />
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 2 }, (_, index) => <Card key={index} className="h-56 animate-pulse bg-row-hover" />)}
      </div>
    </div>
  )
}
