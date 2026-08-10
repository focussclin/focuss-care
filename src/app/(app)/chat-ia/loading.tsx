import { PageSkeleton } from '@/components/layout/PageSkeleton'

export default function ChatIaLoading() {
  return (
    <PageSkeleton
      label="Carregando assistente com IA"
      panels={['h-64']}
    />
  )
}
