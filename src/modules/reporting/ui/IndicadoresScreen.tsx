import { BarChart3, Minus, TrendingDown, TrendingUp } from 'lucide-react'

import { PageHeader } from '@/components/layout/PageHeader'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'

export interface MonthlyPointDto {
  /** Rótulo já formatado em pt-BR — a tela não reconstrói data. */
  label: string
  appointments: number
  completed: number
  newPatients: number
}

export interface IndicadoresScreenProps {
  points: readonly MonthlyPointDto[]
  isLive: boolean
}

type SeriesKey = 'appointments' | 'completed' | 'newPatients'

const SERIES: readonly {
  key: SeriesKey
  label: string
  description: string
}[] = [
  {
    key: 'appointments',
    label: 'Atendimentos marcados',
    description: 'Exclui cancelados — horário devolvido não é atendimento.',
  },
  {
    key: 'completed',
    label: 'Atendimentos realizados',
    description: 'Dos marcados, os que efetivamente aconteceram.',
  },
  {
    key: 'newPatients',
    label: 'Pacientes novos',
    description: 'Cadastros criados no mês.',
  },
]

/**
 * Indicadores — a EVOLUÇÃO, que `/relatorios` não mostra.
 *
 * # Por que não é uma segunda tela de relatórios
 *
 * `/relatorios` responde "como foi este período": totais, desfechos, quem
 * atendeu. É uma fotografia, e uma fotografia não diz se a clínica está
 * crescendo. Duas perguntas diferentes, e a segunda é a que decide contratação,
 * horário de funcionamento e investimento.
 *
 * # Por que o gráfico é feito de `<div>`, e não de biblioteca
 *
 * São três séries de doze pontos. Uma biblioteca de gráficos custaria dezenas de
 * kilobytes no bundle e traria um `canvas` que leitor de tela não lê. Barras em
 * CSS custam zero, e a tabela que as acompanha é o mesmo dado em texto — quem
 * usa leitor de tela recebe os números, não uma imagem sem alternativa.
 */
export function IndicadoresScreen({ points, isLive }: IndicadoresScreenProps) {
  const hasData = points.some(
    (point) =>
      point.appointments > 0 || point.completed > 0 || point.newPatients > 0,
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Últimos 12 meses"
        title="Indicadores"
        description="Como a clínica evoluiu nos últimos meses."
      />

      {!isLive ? (
        <p
          role="status"
          className="rounded-card border border-attention/30 bg-attention-surface px-4 py-3 text-aux text-foreground"
        >
          Demonstração local: a série é contada dos dados de exemplo.
        </p>
      ) : null}

      {!hasData ? (
        <Card className="p-6">
          <EmptyState
            icon={BarChart3}
            title="Ainda não há histórico"
            description="Os indicadores aparecem conforme a clínica registra atendimentos e cadastra pacientes."
          />
        </Card>
      ) : (
        SERIES.map((series) => (
          <SeriesCard key={series.key} series={series} points={points} />
        ))
      )}
    </div>
  )
}

function SeriesCard({
  series,
  points,
}: {
  series: { key: SeriesKey; label: string; description: string }
  points: readonly MonthlyPointDto[]
}) {
  const values = points.map((point) => point[series.key])
  const max = Math.max(...values, 1)
  const variation = describeVariation(values)

  return (
    <Card className="flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-h3 font-semibold text-foreground">
            {series.label}
          </h2>
          <p className="text-aux text-muted">{series.description}</p>
        </div>

        <p
          className={`flex items-center gap-1.5 text-control font-semibold ${variation.tone}`}
        >
          <variation.Icon aria-hidden className="size-4" />
          {variation.label}
        </p>
      </div>

      {/*
        A tabela é a fonte, e as barras são a leitura rápida do mesmo dado.
        `aria-hidden` nas barras porque repetir os números em duas formas faz o
        leitor de tela ler tudo duas vezes.
      */}
      <div aria-hidden className="flex h-32 items-end gap-1.5">
        {points.map((point) => (
          <div
            key={point.label}
            className="flex flex-1 flex-col items-center justify-end gap-1"
          >
            <span className="text-label text-muted">
              {point[series.key] || ''}
            </span>
            <div
              className="w-full rounded-t-[4px] bg-brand-accent"
              style={{
                height: `${Math.round((point[series.key] / max) * 100)}%`,
                minHeight: point[series.key] > 0 ? '4px' : '1px',
              }}
            />
          </div>
        ))}
      </div>

      <table className="w-full text-aux">
        <caption className="sr-only">
          {series.label} por mês, do mais antigo para o mais recente
        </caption>
        <thead>
          <tr className="text-left text-muted">
            <th scope="col" className="font-medium">
              Mês
            </th>
            <th scope="col" className="text-right font-medium">
              {series.label}
            </th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.label} className="border-t border-border-card">
              <th scope="row" className="py-1.5 font-normal text-foreground">
                {point.label}
              </th>
              <td className="py-1.5 text-right text-foreground">
                {point[series.key]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

/**
 * Último mês contra o anterior.
 *
 * Sem base — mês anterior em zero — não devolve "+100%": crescer do nada não é
 * percentual, e o primeiro mês de qualquer clínica cairia nesse caso. É a mesma
 * regra que o painel já aplica ao card de novos pacientes.
 */
function describeVariation(values: readonly number[]) {
  const current = values.at(-1) ?? 0
  const previous = values.at(-2) ?? 0

  if (previous === 0) {
    return {
      label: 'sem base de comparação',
      tone: 'text-muted',
      Icon: Minus,
    }
  }

  const delta = Math.round(((current - previous) / previous) * 100)

  if (delta === 0) {
    return { label: 'estável no mês', tone: 'text-muted', Icon: Minus }
  }

  return delta > 0
    ? {
        label: `+${delta}% no mês`,
        tone: 'text-status-positive',
        Icon: TrendingUp,
      }
    : { label: `${delta}% no mês`, tone: 'text-danger', Icon: TrendingDown }
}
