'use client'

import { useEffect, useState } from 'react'

import { MIN_SEARCH_LENGTH } from './commands'

/**
 * Uma busca da paleta de comandos.
 *
 * # Por que isto existe
 *
 * A paleta consultava três fontes — pacientes, agendamentos, cobranças — com
 * três efeitos praticamente idênticos e nove pedaços de estado. Cada fonte nova
 * era uma quarta cópia do mesmo `setTimeout`, do mesmo `active`, do mesmo trio
 * `results/pending/error` e de mais três linhas em cada um dos dois pontos de
 * limpeza. A cópia que alguém esquecesse de atualizar não quebraria teste
 * nenhum: só deixaria um "Buscando…" aceso para sempre, ou um resultado da
 * consulta anterior na tela.
 *
 * # `pending` e `error` são DERIVADOS, não sinalizados
 *
 * O estado guarda o termo que produziu a resposta. "Está carregando" é
 * `termo pedido ≠ termo respondido` — o mesmo desenho do seletor de vínculo do
 * prontuário e do histórico de versões. Com um booleano à parte seria preciso
 * apagá-lo em todo caminho de saída (sucesso, erro, troca de termo, fechar a
 * paleta), e é exatamente aí que nasce o indicador que nunca desliga.
 *
 * O resultado da consulta anterior some no mesmo instante em que o termo muda,
 * porque ele não é "o que está guardado" e sim "o que está guardado PARA ESTE
 * termo".
 */

/** O formato de `ActionResult` visto de fora do servidor. */
type SearchOutcome<T> =
  | { ok: true; data: readonly T[] }
  | { ok: false; error: { message: string } }

export interface PaletteSearchOptions<T> {
  open: boolean
  /** O texto cru do campo. O `trim` acontece aqui dentro. */
  query: string
  /**
   * O papel da sessão alcança esta fonte?
   *
   * Falso não é só esconder resultado: a consulta **não sai**. A action recusaria
   * de qualquer forma — esta porta evita a ida de rede e o erro vermelho que a
   * recusa produziria a cada tecla.
   */
  enabled: boolean
  /**
   * A Server Action da fonte.
   *
   * Recebe a função em si, e não um callback montado no render, porque a
   * identidade precisa ser estável: um arrow inline mudaria a cada tecla e
   * refaria o efeito — o debounce nunca chegaria ao fim.
   */
  action: (input: { query: string }) => Promise<SearchOutcome<T>>
  /** O que dizer quando a chamada nem chega a responder. */
  failureMessage: string
}

export interface PaletteSearchState<T> {
  results: readonly T[]
  pending: boolean
  error: string | null
}

/** Espera antes de consultar: uma tecla a mais não é uma consulta a mais. */
const DEBOUNCE_MS = 250

export function usePaletteSearch<T>({
  open,
  query,
  enabled,
  action,
  failureMessage,
}: PaletteSearchOptions<T>): PaletteSearchState<T> {
  const [settled, setSettled] = useState<{
    term: string
    results: readonly T[]
    error: string | null
  } | null>(null)

  const term = query.trim()
  const shouldSearch = open && enabled && term.length >= MIN_SEARCH_LENGTH

  useEffect(() => {
    if (!shouldSearch) return

    let active = true

    const timeout = window.setTimeout(() => {
      void action({ query: term })
        .then((result) => {
          if (!active) return

          setSettled(
            result.ok
              ? { term, results: result.data, error: null }
              : { term, results: [], error: result.error.message },
          )
        })
        .catch(() => {
          if (!active) return
          setSettled({ term, results: [], error: failureMessage })
        })
    }, DEBOUNCE_MS)

    return () => {
      /*
       * Resposta atrasada é descartada.
       *
       * Sem isto, quem digita "ma" e completa "maria" pode ver a lista de "ma"
       * chegar depois e ficar na tela — resultados que não correspondem ao que
       * está escrito no campo.
       */
      active = false
      window.clearTimeout(timeout)
    }
  }, [shouldSearch, term, action, failureMessage])

  const isCurrent = settled?.term === term

  return {
    results: shouldSearch && isCurrent ? settled.results : [],
    pending: shouldSearch && !isCurrent,
    error: shouldSearch && isCurrent ? settled.error : null,
  }
}
