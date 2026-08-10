import { PageSkeleton } from '@/components/layout/PageSkeleton'

export default function DisplayLoading() {
  return (
    <PageSkeleton
      label="Carregando painel de chamada"
      panels={['h-[32rem]']}
    />
  )
}
