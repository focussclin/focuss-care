import { PageSkeleton } from '@/components/layout/PageSkeleton'

export default function AutomacoesLoading() {
  return (
    <PageSkeleton
      label="Carregando automações"
      panels={['h-64']}
    />
  )
}
