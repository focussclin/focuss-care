import { PageSkeleton } from '@/components/layout/PageSkeleton'

export default function IndicadoresLoading() {
  return (
    <PageSkeleton
      label="Carregando indicadores"
      metrics={4}
      panels={['h-96']}
    />
  )
}
