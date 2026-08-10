import { PageSkeleton } from '@/components/layout/PageSkeleton'

export default function AuditoriaLoading() {
  return (
    <PageSkeleton
      label="Carregando trilha de auditoria"
      panels={['h-[32rem]']}
    />
  )
}
