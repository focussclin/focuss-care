import { PageSkeleton } from '@/components/layout/PageSkeleton'

export default function RelatoriosLoading() {
  return (
    <PageSkeleton
      label="Carregando relatórios"
      metrics={4}
      panels={['h-80']}
    />
  )
}
