import { PageSkeleton } from '@/components/layout/PageSkeleton'

export default function ProntuariosLoading() {
  return (
    <PageSkeleton
      label="Carregando prontuários"
      panels={['h-[32rem]']}
    />
  )
}
