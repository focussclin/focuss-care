import { PageSkeleton } from '@/components/layout/PageSkeleton'

export default function PatientHistoryLoading() {
  return (
    <PageSkeleton
      label="Carregando histórico de atendimentos"
      panels={['h-[32rem]']}
    />
  )
}
