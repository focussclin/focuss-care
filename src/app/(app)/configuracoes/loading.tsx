import { PageSkeleton } from '@/components/layout/PageSkeleton'

export default function ConfiguracoesLoading() {
  return (
    <PageSkeleton
      label="Carregando configurações da clínica"
      panels={['h-80', 'h-64']}
    />
  )
}
