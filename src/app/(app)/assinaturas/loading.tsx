import { PageSkeleton } from '@/components/layout/PageSkeleton'

export default function AssinaturasLoading() {
  return (
    <PageSkeleton
      label="Carregando assinatura da clínica"
      metrics={4}
      panels={['h-64']}
    />
  )
}
