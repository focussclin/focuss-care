import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { StatCardSkeleton } from '@/components/ui/stat-card'

/**
 * Esqueleto genérico de rota, para os `loading.tsx` que não precisam
 * reproduzir uma grade específica.
 *
 * # Por que existe
 *
 * Quinze rotas de `(app)` não tinham `loading.tsx` nenhum, e todas fazem de
 * quatro a seis `await` no servidor antes de renderizar. Sem o arquivo, o Next
 * segura a navegação na TELA ANTERIOR: quem clicou não vê nada acontecer e
 * clica de novo. Numa recepção com paciente na frente, isso é a diferença entre
 * "está carregando" e "travou".
 *
 * Escrever quinze esqueletos sob medida seria muito código de baixa densidade,
 * e o `/dashboard` — que reproduz a grade real para o layout não pular — já
 * mostra quando vale a pena fazer um específico. Este cobre o resto: cabeçalho,
 * métricas opcionais e painéis.
 *
 * # O que ele conserta além da espera
 *
 * `Skeleton` é `aria-hidden`, e com razão: retângulo cinza não é conteúdo. Mas
 * como o `loading.tsx` inteiro é feito deles, quem usa leitor de tela recebia
 * uma **página vazia e silenciosa** — indistinguível de erro.
 *
 * O `role="status"` com texto `sr-only` abaixo é o que anuncia. Ele é a única
 * coisa aqui que não é decoração.
 */
export interface PageSkeletonProps {
  /** O que está carregando, para quem não vê a tela. Ex.: "Carregando agenda". */
  label: string
  /** Quantidade de cartões de métrica, quando a tela tem essa faixa. */
  metrics?: number
  /**
   * Altura de cada painel, como classe Tailwind (`h-64`, `h-96`).
   *
   * Classe, e não número: `Skeleton` só aceita `className`, e passar `style`
   * exigiria alargar um primitivo do design system para servir a um esqueleto.
   * Painel alto é lista ou tabela; baixo é um bloco de resumo.
   */
  panels?: readonly string[]
}

export function PageSkeleton({
  label,
  metrics = 0,
  panels = ['h-80'],
}: PageSkeletonProps) {
  return (
    <div className="flex flex-col gap-6" aria-busy="true">
      <p role="status" className="sr-only">
        {label}
      </p>

      <div className="flex flex-col gap-2">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-[min(32rem,90%)]" />
      </div>

      {metrics > 0 ? (
        <div className="grid grid-cols-2 gap-4 nav:grid-cols-4">
          {Array.from({ length: metrics }, (_, index) => (
            <StatCardSkeleton key={index} />
          ))}
        </div>
      ) : null}

      {panels.map((height, index) => (
        <Card key={index} className="p-5">
          <Skeleton className="h-5 w-40" />
          <Skeleton className={`mt-4 w-full ${height}`} />
        </Card>
      ))}
    </div>
  )
}
