import { PageSkeleton } from '@/components/layout/PageSkeleton'

export default function WhatsappLoading() {
  return (
    <PageSkeleton
      label="Carregando estado do WhatsApp"
      panels={['h-64']}
    />
  )
}
