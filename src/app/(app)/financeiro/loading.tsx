import { PageSkeleton } from '@/components/layout/PageSkeleton'

export default function FinanceiroLoading() {
  return (
    <PageSkeleton
      label="Carregando financeiro"
      metrics={4}
      panels={['h-96', 'h-64']}
    />
  )
}
