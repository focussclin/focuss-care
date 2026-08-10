import { PageSkeleton } from '@/components/layout/PageSkeleton'

export default function PortalProfissionalLoading() {
  return (
    <PageSkeleton
      label="Carregando seu dia"
      metrics={4}
      panels={['h-64', 'h-64']}
    />
  )
}
