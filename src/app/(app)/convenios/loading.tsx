import { PageSkeleton } from '@/components/layout/PageSkeleton'

export default function ConveniosLoading() {
  return (
    <PageSkeleton
      label="Carregando convênios, guias e glosas"
      metrics={4}
      panels={['h-96']}
    />
  )
}
