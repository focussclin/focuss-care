'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

import { Card } from '@/components/ui/card'

export interface CallPanelEntryDto {
  id: string
  displayName: string
  professionalName: string | null
}

export interface CallPanelScreenProps {
  nowCalling: CallPanelEntryDto | null
  previousCalls: readonly CallPanelEntryDto[]
  waitingCount: number
  /**
   * Há banco por trás desta tela.
   *
   * Falso significa demonstração local. Um painel de chamada é a tela em que
   * fingir custa mais caro: alguém levanta e vai até a sala.
   */
  isLive: boolean
}

/** De quanto em quanto tempo a parede volta a perguntar ao servidor. */
const REFRESH_MS = 15_000

/**
 * Painel de chamada da sala de espera — a TV na parede.
 *
 * # Por que recarrega sozinho, e por que a cada 15 segundos
 *
 * Ninguém opera esta tela: ela fica aberta o dia inteiro numa TV, sem teclado e
 * sem mouse. Se não se atualizar sozinha, mostra a chamada das oito da manhã até
 * alguém perceber — e é pior que não ter painel, porque a sala confia nele.
 *
 * Quinze segundos é o intervalo em que a pessoa chamada ainda está caminhando
 * até a sala. Mais curto vira consulta ao banco sem ninguém olhando; mais longo
 * e a recepção chama de novo em voz alta, que é justamente o que o painel
 * deveria evitar.
 *
 * `router.refresh()` refaz a renderização no servidor, então a leitura continua
 * passando pela sessão e pela RLS — não há atalho de cliente lendo o banco.
 *
 * # O que esta tela deliberadamente não mostra
 *
 * Nome completo, motivo da vinda e identificadores. O porquê está em
 * `application/callPanel.ts`, e não aqui: quem decide o recorte é a camada que
 * monta o painel, não a que o desenha.
 */
export function CallPanelScreen({
  nowCalling,
  previousCalls,
  waitingCount,
  isLive,
}: CallPanelScreenProps) {
  const router = useRouter()

  useEffect(() => {
    const timer = setInterval(() => router.refresh(), REFRESH_MS)
    return () => clearInterval(timer)
  }, [router])

  return (
    <div className="flex min-h-[70vh] flex-col gap-6">
      {/*
        `h1` invisível — a única tela do produto sem `PageHeader`, e com razão:
        o painel é para a TV da sala de espera, e um título ocupando o topo
        rouba espaço do nome que precisa ser lido de longe.
      */}
      <h1 className="sr-only">Painel de chamada</h1>

      {!isLive ? (
        <p
          role="status"
          className="rounded-card border border-attention/30 bg-attention-surface px-4 py-3 text-aux text-foreground"
        >
          Demonstração local: este painel não está ligado à fila real da clínica.
        </p>
      ) : null}

      <Card className="flex flex-1 flex-col items-center justify-center gap-6 py-16 text-center">
        {nowCalling ? (
          <>
            <p className="text-label font-semibold tracking-[0.18em] text-muted uppercase">
              Chamando agora
            </p>

            {/*
              `aria-live` porque leitores de tela também são usados em painel
              público, e a troca de nome é a única informação da tela.
            */}
            <p
              aria-live="polite"
              className="text-[clamp(2.5rem,9vw,6rem)] leading-none font-semibold tracking-[-0.03em] text-foreground"
            >
              {nowCalling.displayName}
            </p>

            {nowCalling.professionalName ? (
              <p className="text-[clamp(1.1rem,3vw,2rem)] text-muted">
                {nowCalling.professionalName}
              </p>
            ) : null}
          </>
        ) : (
          <>
            <p className="text-[clamp(1.5rem,5vw,3rem)] font-semibold text-muted">
              Nenhuma chamada no momento
            </p>
            <p className="text-control text-muted">
              A próxima pessoa aparece aqui assim que a recepção chamar.
            </p>
          </>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
        <Card className="flex flex-col gap-3 p-6">
          <p className="text-label font-semibold tracking-[0.14em] text-muted uppercase">
            Chamadas anteriores
          </p>

          {previousCalls.length === 0 ? (
            <p className="text-control text-muted">Ainda não houve chamadas hoje.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {previousCalls.map((call) => (
                <li
                  key={call.id}
                  className="flex items-baseline justify-between gap-4 text-[clamp(1rem,2.2vw,1.5rem)] text-foreground"
                >
                  <span>{call.displayName}</span>
                  {call.professionalName ? (
                    <span className="text-aux text-muted">
                      {call.professionalName}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="flex flex-col items-center justify-center gap-1 p-6">
          <p className="text-[clamp(2rem,6vw,3.5rem)] leading-none font-semibold text-foreground">
            {waitingCount}
          </p>
          <p className="text-aux text-muted">
            {waitingCount === 1 ? 'pessoa aguardando' : 'pessoas aguardando'}
          </p>
        </Card>
      </div>
    </div>
  )
}
