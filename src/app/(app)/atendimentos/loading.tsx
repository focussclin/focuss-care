import { PageSkeleton } from '@/components/layout/PageSkeleton'

export default function AtendimentosLoading() {
  return (
    <PageSkeleton
      label="Carregando fila e atendimentos do dia"
      metrics={4}
      panels={['h-96']}
    />
  )
}
