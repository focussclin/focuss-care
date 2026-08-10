import { PageSkeleton } from '@/components/layout/PageSkeleton'

/**
 * Esqueleto PRÓPRIO, e não o de `/pacientes`.
 *
 * O `loading.tsx` do segmento pai cobriria este por herança, mas mostraria o
 * esqueleto da LISTA enquanto carrega uma FICHA — a forma errada, que faz o
 * layout pular quando o conteúdo chega.
 */
export default function PatientProfileLoading() {
  return (
    <PageSkeleton
      label="Carregando ficha do paciente"
      panels={['h-64', 'h-80']}
    />
  )
}
