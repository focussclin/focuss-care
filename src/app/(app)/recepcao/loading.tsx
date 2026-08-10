import { PageSkeleton } from '@/components/layout/PageSkeleton'

export default function RecepcaoLoading() {
  return (
    <PageSkeleton
      label="Carregando recepção"
      metrics={4}
      panels={['h-96']}
    />
  )
}
