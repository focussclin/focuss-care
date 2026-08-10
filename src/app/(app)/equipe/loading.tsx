import { PageSkeleton } from '@/components/layout/PageSkeleton'

export default function EquipeLoading() {
  return (
    <PageSkeleton
      label="Carregando equipe e permissões"
      metrics={4}
      panels={['h-96']}
    />
  )
}
